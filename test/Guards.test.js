const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const e18 = (n) => ethers.parseEther(String(n));
// Stork's real ETHUSD feed id, from Horizen's oracle documentation.
const ETH_USD_FEED = "0x59102b37de83bdda9f38ac8254e596f0d9ac61d2035c07936675e87342817160";

/**
 * The two operational guards a guarded launch needs: a ceiling on how much
 * the vault can take, and a way to stop the bleeding if something is wrong.
 */
async function fixture(depositCap = 0n) {
  const [owner, trader, feeRecipient, alice] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const baseAsset = await MockERC20.deploy("Mock USDT", "mUSDT", 18);
  const weth = await MockERC20.deploy("Mock Wrapped Ether", "mWETH", 18);

  const MockStork = await ethers.getContractFactory("MockStork");
  const oracle = await MockStork.deploy();
  await oracle.setPrice(ETH_USD_FEED, 10n ** 18n);

  const MockDexRouter = await ethers.getContractFactory("MockDexRouter");
  const router = await MockDexRouter.deploy();
  await router.setRate(baseAsset.target, weth.target, e18(1));

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(owner.address, router.target, oracle.target);

  const tx = await factory.deployVault({
    baseAsset: baseAsset.target,
    shareName: "Vault Share",
    shareSymbol: "vSHARE",
    trader: trader.address,
    feeRecipient: feeRecipient.address,
    performanceFeeBps: 2_000,
    maxOracleAge: 3600,
    depositCap,
    caps: {
      maxPositionSize: e18(1_000_000),
      maxSingleAssetBps: 10_000,
      maxDrawdownBps: 10_000,
    },
  });
  const receipt = await tx.wait();
  const ev = receipt.logs
    .map((l) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "VaultDeployed");

  const vault = await ethers.getContractAt("Vault", ev.args.vault);
  const shareToken = await ethers.getContractAt("ShareToken", await vault.shareToken());
  const executor = await ethers.getContractAt("StrategyExecutor", await vault.strategyExecutor());

  await vault.connect(owner).trackAsset(weth.target, ETH_USD_FEED);
  await baseAsset.mint(alice.address, e18(10_000));
  await baseAsset.connect(alice).approve(vault.target, ethers.MaxUint256);

  return { vault, shareToken, executor, baseAsset, weth, owner, trader, alice };
}

// loadFixture needs stable named functions, so the two cap variants get one
// each rather than an inline closure.
const uncapped = () => fixture(0n);
const cappedAt1000 = () => fixture(e18(1_000));

describe("Deposit cap", function () {
  it("is uncapped when set to zero", async function () {
    const { vault, alice } = await loadFixture(uncapped);

    await expect(vault.connect(alice).deposit(e18(9_000))).to.not.be.reverted;
    expect(await vault.nav()).to.equal(e18(9_000));
  });

  it("accepts a deposit that exactly reaches the cap", async function () {
    const { vault, alice } = await loadFixture(cappedAt1000);

    await expect(vault.connect(alice).deposit(e18(1_000))).to.not.be.reverted;
    expect(await vault.nav()).to.equal(e18(1_000));
  });

  it("rejects a deposit that would push NAV past the cap", async function () {
    const { vault, alice } = await loadFixture(cappedAt1000);

    await vault.connect(alice).deposit(e18(900));
    await expect(vault.connect(alice).deposit(e18(200)))
      .to.be.revertedWithCustomError(vault, "DepositCapExceeded")
      .withArgs(e18(1_100), e18(1_000));

    // The room below the cap is still usable.
    await expect(vault.connect(alice).deposit(e18(100))).to.not.be.reverted;
  });

  it("never blocks a withdrawal, even while full", async function () {
    const { vault, shareToken, alice } = await loadFixture(cappedAt1000);

    await vault.connect(alice).deposit(e18(1_000));
    const shares = await shareToken.balanceOf(alice.address);
    await expect(vault.connect(alice).withdraw(shares / 2n)).to.not.be.reverted;
  });

  it("only the owner can change the cap", async function () {
    const { vault, alice, owner } = await loadFixture(cappedAt1000);

    await expect(vault.connect(alice).setDepositCap(e18(5_000))).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );

    await expect(vault.connect(owner).setDepositCap(e18(5_000)))
      .to.emit(vault, "DepositCapUpdated")
      .withArgs(e18(5_000));
    await expect(vault.connect(alice).deposit(e18(3_000))).to.not.be.reverted;
  });
});

describe("Pause", function () {
  it("blocks deposits while paused and allows them again after", async function () {
    const { vault, owner, alice } = await loadFixture(uncapped);

    await vault.connect(owner).pause();
    await expect(vault.connect(alice).deposit(e18(100))).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause"
    );

    await vault.connect(owner).unpause();
    await expect(vault.connect(alice).deposit(e18(100))).to.not.be.reverted;
  });

  it("blocks the strategy from trading while paused", async function () {
    const { vault, executor, baseAsset, weth, owner, trader, alice } = await loadFixture(uncapped);

    await vault.connect(alice).deposit(e18(1_000));
    await vault.connect(owner).pause();

    await expect(
      executor
        .connect(trader)
        .executeSwap([baseAsset.target, weth.target], e18(100), 0, ethers.MaxUint256)
    ).to.be.revertedWithCustomError(vault, "EnforcedPause");
  });

  it("still lets depositors withdraw while paused", async function () {
    const { vault, shareToken, baseAsset, owner, alice } = await loadFixture(uncapped);

    await vault.connect(alice).deposit(e18(1_000));
    await vault.connect(owner).pause();

    // The point of the pause: stop new money and stop trading, without ever
    // trapping money already in. A pause that stranded depositors would
    // contradict the vault holding its own funds in the first place.
    const before = await baseAsset.balanceOf(alice.address);
    const shares = await shareToken.balanceOf(alice.address);
    await expect(vault.connect(alice).withdraw(shares)).to.not.be.reverted;
    expect(await baseAsset.balanceOf(alice.address)).to.equal(before + e18(1_000));
    expect(await vault.paused()).to.equal(true);
  });

  it("only the owner can pause or unpause", async function () {
    const { vault, alice, trader } = await loadFixture(uncapped);

    await expect(vault.connect(alice).pause()).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
    await expect(vault.connect(trader).pause()).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
  });
});
