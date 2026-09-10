const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

// Stork's real ETHUSD feed id, from Horizen's oracle documentation.
const ETH_USD_FEED = "0x59102b37de83bdda9f38ac8254e596f0d9ac61d2035c07936675e87342817160";
const ONE_USD = 10n ** 18n; // Stork quantizes to 18 decimals
const usdt = (n) => BigInt(n) * 10n ** 6n; // 6-decimal base asset
const e18 = (n) => ethers.parseEther(String(n));

/**
 * The base asset here is a 6-decimal stablecoin (as USDT actually is on most
 * chains) while shares and the tracked asset are 18-decimal. Mixing those
 * scales is exactly what NAV got wrong before, so these tests pin the
 * conversions rather than the happy path.
 */
async function sixDecimalFixture() {
  const [owner, trader, feeRecipient, alice] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const baseAsset = await MockERC20.deploy("Mock USDT", "mUSDT", 6);
  const weth = await MockERC20.deploy("Mock Wrapped Ether", "mWETH", 18);

  const MockStork = await ethers.getContractFactory("MockStork");
  const oracle = await MockStork.deploy();
  await oracle.setPrice(ETH_USD_FEED, ONE_USD);

  const MockDexRouter = await ethers.getContractFactory("MockDexRouter");
  const router = await MockDexRouter.deploy();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(
    owner.address,
    await router.getAddress(),
    await oracle.getAddress()
  );

  const tx = await factory.deployVault({
    baseAsset: await baseAsset.getAddress(),
    shareName: "USDT Vault Share",
    shareSymbol: "vUSDT",
    trader: trader.address,
    feeRecipient: feeRecipient.address,
    performanceFeeBps: 2_000,
    maxOracleAge: 3600,
    depositCap: 0n, // uncapped in tests/scripts unless set explicitly
    caps: {
      maxPositionSize: usdt(100_000),
      maxSingleAssetBps: 10_000,
      maxDrawdownBps: 5_000,
    },
  });
  const receipt = await tx.wait();
  const deployed = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "VaultDeployed");

  const vault = await ethers.getContractAt("Vault", deployed.args.vault);
  const shareToken = await ethers.getContractAt("ShareToken", await vault.shareToken());
  const executor = await ethers.getContractAt("StrategyExecutor", await vault.strategyExecutor());

  await vault.connect(owner).trackAsset(await weth.getAddress(), ETH_USD_FEED);
  await baseAsset.mint(alice.address, usdt(100_000));
  await baseAsset.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);

  return { owner, trader, alice, baseAsset, weth, oracle, router, vault, shareToken, executor };
}

describe("Decimal handling", function () {
  it("reads the base asset's decimals off the token", async function () {
    const { vault } = await loadFixture(sixDecimalFixture);
    expect(await vault.baseDecimals()).to.equal(6);
  });

  it("mints 18-decimal shares for a 6-decimal deposit, at 1.0 NAV/share", async function () {
    const { alice, vault, shareToken } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));

    // NAV stays in the base asset's own units...
    expect(await vault.nav()).to.equal(usdt(1000));
    // ...while shares are 18-decimal, so NAV/share is still exactly 1.0
    // rather than 1e-12 of it.
    expect(await shareToken.balanceOf(alice.address)).to.equal(e18(1000));
    expect(await vault.navPerShare()).to.equal(e18(1));
  });

  it("returns a 6-decimal payout when burning 18-decimal shares", async function () {
    const { alice, baseAsset, vault } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    const before = await baseAsset.balanceOf(alice.address);
    await vault.connect(alice).withdraw(e18(400));

    expect((await baseAsset.balanceOf(alice.address)) - before).to.equal(usdt(400));
    expect(await vault.nav()).to.equal(usdt(600));
  });

  it("prices an 18-decimal tracked asset into 6-decimal base units", async function () {
    const { alice, weth, vault } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    // 100 WETH at $1.00, held as an 18-decimal token.
    await weth.mint(await vault.getAddress(), e18(100));

    // The bug this pins: adding the raw 18-decimal balance would have made
    // NAV 1000e6 + 100e18 instead of 1100e6.
    expect(await vault.nav()).to.equal(usdt(1100));
  });

  it("prices a tracked asset at a non-unit price correctly", async function () {
    const { alice, weth, oracle, vault } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    await oracle.setPrice(ETH_USD_FEED, (ONE_USD * 7n) / 2n); // $3.50
    await weth.mint(await vault.getAddress(), e18(200));

    expect(await vault.nav()).to.equal(usdt(1000) + usdt(700)); // 200 * 3.50
  });

  it("keeps NAV/share at 1.0 through a mixed-decimal swap", async function () {
    const { alice, trader, baseAsset, weth, router, vault, executor } =
      await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    // 1 USDT (6dp) -> 1 WETH (18dp): the rate carries the decimal shift.
    await router.setRate(await baseAsset.getAddress(), await weth.getAddress(), 10n ** 30n);

    const path = [await baseAsset.getAddress(), await weth.getAddress()];
    await executor.connect(trader).executeSwap(path, usdt(300), 0, ethers.MaxUint256);

    expect(await weth.balanceOf(await vault.getAddress())).to.equal(e18(300));
    expect(await vault.nav()).to.equal(usdt(1000));
    expect(await vault.navPerShare()).to.equal(e18(1));
  });

  it("rejects a base asset with more than 18 decimals", async function () {
    const [owner, trader, feeRecipient] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const weird = await MockERC20.deploy("Weird", "WRD", 24);

    const MockStork = await ethers.getContractFactory("MockStork");
    const oracle = await MockStork.deploy();
    const MockDexRouter = await ethers.getContractFactory("MockDexRouter");
    const router = await MockDexRouter.deploy();
    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    const factory = await VaultFactory.deploy(
      owner.address,
      await router.getAddress(),
      await oracle.getAddress()
    );

    await expect(
      factory.deployVault({
        baseAsset: await weird.getAddress(),
        shareName: "x",
        shareSymbol: "x",
        trader: trader.address,
        feeRecipient: feeRecipient.address,
        performanceFeeBps: 0,
        maxOracleAge: 3600,
        depositCap: 0n, // uncapped in tests/scripts unless set explicitly
        caps: { maxPositionSize: 1n, maxSingleAssetBps: 1, maxDrawdownBps: 1 },
      })
    ).to.be.revertedWithCustomError(await ethers.getContractFactory("Vault"), "UnsupportedDecimals");
  });
});

describe("Oracle safety", function () {
  it("reverts NAV when the price feed is older than maxOracleAge", async function () {
    const { alice, weth, vault } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    await weth.mint(await vault.getAddress(), e18(100));
    expect(await vault.nav()).to.equal(usdt(1100)); // fresh

    await time.increase(3601); // past maxOracleAge

    await expect(vault.nav()).to.be.revertedWithCustomError(vault, "StalePrice");
  });

  it("reverts NAV on a zero price rather than valuing the holding at nothing", async function () {
    const { alice, weth, oracle, vault } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    await weth.mint(await vault.getAddress(), e18(100));
    await oracle.setPrice(ETH_USD_FEED, 0);

    await expect(vault.nav()).to.be.revertedWithCustomError(vault, "InvalidPrice");
  });

  it("does not consult the oracle at all for a base-asset-only vault", async function () {
    const { alice, vault } = await loadFixture(sixDecimalFixture);

    await vault.connect(alice).deposit(usdt(1000));
    // No tracked-asset balance, so a fully stale feed is irrelevant: a
    // USDT-only vault can run before any oracle integration exists.
    await time.increase(100_000);

    expect(await vault.nav()).to.equal(usdt(1000));
    await expect(vault.connect(alice).withdraw(e18(100))).to.not.be.reverted;
  });
});
