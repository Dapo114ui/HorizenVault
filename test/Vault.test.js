const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Stork's real ETHUSD feed id, from Horizen's oracle documentation.
const ETH_USD_FEED = "0x59102b37de83bdda9f38ac8254e596f0d9ac61d2035c07936675e87342817160";

async function deployFixture() {
  const [owner, trader, feeRecipient, alice, bob] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const baseAsset = await MockERC20.deploy("Mock USDT", "mUSDT", 18);
  const weth = await MockERC20.deploy("Mock Wrapped Ether", "mWETH", 18);

  const MockStork = await ethers.getContractFactory("MockStork");
  const oracle = await MockStork.deploy();
  await oracle.setPrice(ETH_USD_FEED, 10n ** 18n); // $1.00 at Stork's 18-decimal scale

  const MockDexRouter = await ethers.getContractFactory("MockDexRouter");
  const router = await MockDexRouter.deploy();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(
    owner.address,
    await router.getAddress(),
    await oracle.getAddress()
  );

  const caps = {
    maxPositionSize: ethers.parseEther("10000"),
    maxSingleAssetBps: 10_000,
    maxDrawdownBps: 1_000, // 10%
  };

  const tx = await factory.deployVault({
    baseAsset: await baseAsset.getAddress(),
    shareName: "Vault Share",
    shareSymbol: "vSHARE",
    trader: trader.address,
    feeRecipient: feeRecipient.address,
    performanceFeeBps: 2_000, // 20%
    maxOracleAge: 3600,
    depositCap: 0n, // uncapped in tests/scripts unless set explicitly
    caps,
  });
  const receipt = await tx.wait();
  const deployedEvent = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "VaultDeployed");

  const vault = await ethers.getContractAt("Vault", deployedEvent.args.vault);
  const shareToken = await ethers.getContractAt("ShareToken", await vault.shareToken());
  const executor = await ethers.getContractAt("StrategyExecutor", await vault.strategyExecutor());
  const riskManager = await ethers.getContractAt("RiskManager", await vault.riskManager());

  await vault.connect(owner).trackAsset(await weth.getAddress(), ETH_USD_FEED);

  const vaultAddr = await vault.getAddress();
  for (const user of [alice, bob]) {
    await baseAsset.mint(user.address, ethers.parseEther("100000"));
    await baseAsset.connect(user).approve(vaultAddr, ethers.MaxUint256);
  }

  return {
    owner,
    trader,
    feeRecipient,
    alice,
    bob,
    baseAsset,
    weth,
    oracle,
    router,
    factory,
    vault,
    shareToken,
    executor,
    riskManager,
  };
}

describe("Vault", function () {
  describe("deposits and withdrawals", function () {
    it("mints shares 1:1 on the first deposit", async function () {
      const { alice, vault, shareToken } = await loadFixture(deployFixture);

      await vault.connect(alice).deposit(ethers.parseEther("1000"));

      expect(await shareToken.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
      expect(await vault.nav()).to.equal(ethers.parseEther("1000"));
      expect(await vault.navPerShare()).to.equal(ethers.parseEther("1"));
    });

    it("mints pro-rata shares on a deposit after NAV has grown", async function () {
      const { alice, bob, baseAsset, vault, shareToken } = await loadFixture(deployFixture);

      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      // Simulate the strategy having made 100 in profit already sitting as baseAsset.
      await baseAsset.mint(await vault.getAddress(), ethers.parseEther("100"));
      // Crystallize up front so the deposit's own internal crystallize call
      // is a no-op, isolating this test to the pro-rata share math.
      await vault.crystallizePerformanceFee();

      const supplyBefore = await shareToken.totalSupply();
      const navBefore = await vault.nav();
      const depositAmount = ethers.parseEther("500");
      const expectedShares = (depositAmount * supplyBefore) / navBefore;

      await vault.connect(bob).deposit(depositAmount);

      expect(await shareToken.balanceOf(bob.address)).to.equal(expectedShares);
      // Bob's pro-rata mint should not have diluted Alice's existing shares.
      expect(await shareToken.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    });

    it("burns shares and pays out a pro-rata slice of NAV on withdraw", async function () {
      const { alice, baseAsset, vault, shareToken } = await loadFixture(deployFixture);

      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      await baseAsset.mint(await vault.getAddress(), ethers.parseEther("100")); // NAV -> 1100
      // Crystallize up front so withdraw's own internal crystallize call is
      // a no-op, isolating this test to the pro-rata share math.
      await vault.crystallizePerformanceFee();

      const withdrawShares = ethers.parseEther("400");
      const supply = await shareToken.totalSupply();
      const nav = await vault.nav();
      const expectedAssets = (withdrawShares * nav) / supply;

      const balBefore = await baseAsset.balanceOf(alice.address);
      await vault.connect(alice).withdraw(withdrawShares);
      const balAfter = await baseAsset.balanceOf(alice.address);

      expect(balAfter - balBefore).to.equal(expectedAssets);
      expect(await shareToken.balanceOf(alice.address)).to.equal(ethers.parseEther("600"));
    });

    it("reverts a withdrawal for more shares than the caller holds", async function () {
      const { alice, vault } = await loadFixture(deployFixture);

      await vault.connect(alice).deposit(ethers.parseEther("100"));

      await expect(
        vault.connect(alice).withdraw(ethers.parseEther("101"))
      ).to.be.revertedWithCustomError(vault, "InsufficientShares");
    });
  });

  describe("strategy execution and risk caps", function () {
    async function setupTradeableVault() {
      const fixture = await deployFixture();
      const { alice, baseAsset, router, weth, vault } = fixture;

      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      // 1 baseAsset -> 1 WETH, no slippage, so trades don't move NAV by default.
      await router.setRate(
        await baseAsset.getAddress(),
        await weth.getAddress(),
        ethers.parseEther("1")
      );
      return fixture;
    }

    it("routes a swap through the venue and prices the resulting position via the oracle", async function () {
      const { trader, executor, vault, weth } = await setupTradeableVault();
      const amountIn = ethers.parseEther("100");
      const path = [await vault.baseAsset(), await weth.getAddress()];

      await executor.connect(trader).executeSwap(path, amountIn, 0, ethers.MaxUint256);

      expect(await weth.balanceOf(await vault.getAddress())).to.equal(amountIn);
      // Same-value swap: NAV should be unchanged (900 base + 100 WETH-priced-as-base).
      expect(await vault.nav()).to.equal(ethers.parseEther("1000"));
    });

    it("reverts a trade that exceeds the max position size", async function () {
      const { trader, executor, vault, weth, riskManager } = await setupTradeableVault();
      const path = [await vault.baseAsset(), await weth.getAddress()];
      const tooLarge = ethers.parseEther("10001"); // cap is 10000

      await expect(
        executor.connect(trader).executeSwap(path, tooLarge, 0, ethers.MaxUint256)
      ).to.be.revertedWithCustomError(riskManager, "PositionTooLarge");
    });

    it("reverts a trade that pushes a single asset's exposure above its cap", async function () {
      const fixture = await deployFixture();
      const { owner, trader, alice, baseAsset, weth, router, riskManager, factory } = fixture;
      // Redeploy with a tight single-asset exposure cap for this scenario.
      const tx = await factory.connect(owner).deployVault({
        baseAsset: await baseAsset.getAddress(),
        shareName: "Tight Vault Share",
        shareSymbol: "tvSHARE",
        trader: trader.address,
        feeRecipient: owner.address,
        performanceFeeBps: 0,
        maxOracleAge: 3600,
        depositCap: 0n, // uncapped in tests/scripts unless set explicitly
        caps: {
          maxPositionSize: ethers.parseEther("10000"),
          maxSingleAssetBps: 2_000, // 20% max exposure to any single non-base asset
          maxDrawdownBps: 9_000,
        },
      });
      const receipt = await tx.wait();
      const deployedEvent = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed && parsed.name === "VaultDeployed");
      const tightVault = await ethers.getContractAt("Vault", deployedEvent.args.vault);
      const tightExecutor = await ethers.getContractAt("StrategyExecutor", await tightVault.strategyExecutor());
      const tightRiskManager = await ethers.getContractAt("RiskManager", await tightVault.riskManager());

      await tightVault.connect(owner).trackAsset(await weth.getAddress(), ETH_USD_FEED);
      await baseAsset.connect(alice).approve(await tightVault.getAddress(), ethers.MaxUint256);
      await tightVault.connect(alice).deposit(ethers.parseEther("1000"));
      await router.setRate(await baseAsset.getAddress(), await weth.getAddress(), ethers.parseEther("1"));

      const path = [await baseAsset.getAddress(), await weth.getAddress()];
      // Swapping 30% of NAV into WETH breaches the 20% single-asset cap.
      await expect(
        tightExecutor.connect(trader).executeSwap(path, ethers.parseEther("300"), 0, ethers.MaxUint256)
      ).to.be.revertedWithCustomError(tightRiskManager, "AssetExposureTooHigh");
    });

    it("reverts a trade whose loss would breach the max drawdown cap", async function () {
      const { trader, executor, vault, weth, riskManager, router, baseAsset } = await setupTradeableVault();
      // Re-price the swap so it returns half value: a bad trade.
      await router.setRate(await baseAsset.getAddress(), await weth.getAddress(), ethers.parseEther("0.5"));
      const path = [await baseAsset.getAddress(), await weth.getAddress()];

      await expect(
        executor.connect(trader).executeSwap(path, ethers.parseEther("1000"), 0, ethers.MaxUint256)
      ).to.be.revertedWithCustomError(riskManager, "DrawdownExceeded");
    });

    it("only the designated trader may call the strategy executor", async function () {
      const { alice, executor, vault, weth } = await setupTradeableVault();
      const path = [await vault.baseAsset(), await weth.getAddress()];

      await expect(
        executor.connect(alice).executeSwap(path, ethers.parseEther("10"), 0, ethers.MaxUint256)
      ).to.be.revertedWithCustomError(executor, "OnlyTrader");
    });
  });

  describe("performance fee high-water mark", function () {
    it("charges a fee on new profit but never re-charges profit already crystallized through a drawdown", async function () {
      const { alice, feeRecipient, baseAsset, vault, shareToken } = await loadFixture(deployFixture);
      const vaultAddr = await vault.getAddress();

      await vault.connect(alice).deposit(ethers.parseEther("1000"));

      // --- First profit: NAV/share rises from 1.0 to 1.2, crystallize charges a fee. ---
      await baseAsset.mint(vaultAddr, ethers.parseEther("200"));
      await vault.crystallizePerformanceFee();

      const hwmAfterFirstProfit = await vault.highWaterMark();
      const feeSharesAfterFirstProfit = await shareToken.balanceOf(feeRecipient.address);
      expect(hwmAfterFirstProfit).to.equal(ethers.parseEther("1.2"));
      expect(feeSharesAfterFirstProfit).to.be.gt(0n);

      // --- Drawdown: NAV falls back well below the high-water mark. ---
      await baseAsset.burn(vaultAddr, ethers.parseEther("300"));
      await vault.crystallizePerformanceFee();
      expect(await vault.highWaterMark()).to.equal(hwmAfterFirstProfit);
      expect(await shareToken.balanceOf(feeRecipient.address)).to.equal(feeSharesAfterFirstProfit);

      // --- Recovery back to the exact old peak: still no new fee. ---
      const supply = await shareToken.totalSupply();
      const navForOldPeak = (supply * hwmAfterFirstProfit) / ethers.parseEther("1");
      const navNow = await vault.nav();
      await baseAsset.mint(vaultAddr, navForOldPeak - navNow);
      await vault.crystallizePerformanceFee();
      expect(await vault.highWaterMark()).to.equal(hwmAfterFirstProfit);
      expect(await shareToken.balanceOf(feeRecipient.address)).to.equal(feeSharesAfterFirstProfit);

      // --- New profit past the old peak: fee charged only on the increment. ---
      await baseAsset.mint(vaultAddr, ethers.parseEther("50"));
      await vault.crystallizePerformanceFee();
      expect(await vault.highWaterMark()).to.be.gt(hwmAfterFirstProfit);
      expect(await shareToken.balanceOf(feeRecipient.address)).to.be.gt(feeSharesAfterFirstProfit);
    });
  });
});
