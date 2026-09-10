const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * The factory is what decides who can put a vault in front of depositors, so
 * these cover both halves of that: who may deploy, and what they may deploy.
 */

const VALID_CAPS = {
  maxPositionSize: ethers.parseEther("10000"),
  maxSingleAssetBps: 4_000,
  maxDrawdownBps: 1_500,
};

async function deployFixture() {
  const [owner, operator, outsider, trader, feeRecipient] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const baseAsset = await MockERC20.deploy("Mock USDT", "mUSDT", 18);

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

  const params = (overrides = {}) => ({
    baseAsset: overrides.baseAsset ?? baseAsset.target,
    shareName: "Vault Share",
    shareSymbol: "vSHARE",
    trader: overrides.trader ?? trader.address,
    feeRecipient: overrides.feeRecipient ?? feeRecipient.address,
    performanceFeeBps: overrides.performanceFeeBps ?? 2_000,
    maxOracleAge: 3600,
    depositCap: overrides.depositCap ?? 0n,
    caps: { ...VALID_CAPS, ...(overrides.caps ?? {}) },
  });

  return { factory, baseAsset, owner, operator, outsider, trader, feeRecipient, params };
}

describe("VaultFactory", function () {
  describe("who may deploy", function () {
    it("lets the owner deploy without being explicitly approved", async function () {
      const { factory, owner, params } = await loadFixture(deployFixture);

      await expect(factory.connect(owner).deployVault(params())).to.not.be.reverted;
      expect(await factory.vaultsCount()).to.equal(1n);
    });

    it("rejects an address that has not been approved", async function () {
      const { factory, outsider, params } = await loadFixture(deployFixture);

      await expect(factory.connect(outsider).deployVault(params()))
        .to.be.revertedWithCustomError(factory, "NotApprovedDeployer")
        .withArgs(outsider.address);
    });

    it("lets an approved operator deploy, and records them as the deployer", async function () {
      const { factory, owner, operator, params } = await loadFixture(deployFixture);

      await expect(factory.connect(owner).setDeployer(operator.address, true))
        .to.emit(factory, "DeployerApprovalUpdated")
        .withArgs(operator.address, true);
      expect(await factory.isApprovedDeployer(operator.address)).to.equal(true);

      await factory.connect(operator).deployVault(params());
      const vault = await factory.vaults(0);

      // The operator deployed it, but the protocol owner owns it -- an
      // operator must not be able to widen their own risk caps.
      expect(await factory.vaultDeployer(vault)).to.equal(operator.address);
      const vaultContract = await ethers.getContractAt("Vault", vault);
      const riskManager = await ethers.getContractAt(
        "RiskManager",
        await vaultContract.riskManager()
      );
      expect(await vaultContract.owner()).to.equal(owner.address);
      expect(await riskManager.owner()).to.equal(owner.address);
    });

    it("stops an operator deploying again once approval is revoked", async function () {
      const { factory, owner, operator, params } = await loadFixture(deployFixture);

      await factory.connect(owner).setDeployer(operator.address, true);
      await factory.connect(operator).deployVault(params());

      await factory.connect(owner).setDeployer(operator.address, false);
      await expect(factory.connect(operator).deployVault(params()))
        .to.be.revertedWithCustomError(factory, "NotApprovedDeployer")
        .withArgs(operator.address);

      // Revoking is forward-looking only: the vault they already deployed
      // keeps working, so depositors are never stranded by a policy change.
      expect(await factory.vaultsCount()).to.equal(1n);
    });

    it("only lets the owner change approvals", async function () {
      const { factory, outsider, operator } = await loadFixture(deployFixture);

      await expect(
        factory.connect(outsider).setDeployer(operator.address, true)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("what may be deployed", function () {
    it("rejects a performance fee above the ceiling", async function () {
      const { factory, owner, params } = await loadFixture(deployFixture);
      const max = await factory.MAX_PERFORMANCE_FEE_BPS();

      // The case this exists to stop: a vault that takes everything.
      await expect(factory.connect(owner).deployVault(params({ performanceFeeBps: 10_000 })))
        .to.be.revertedWithCustomError(factory, "PerformanceFeeTooHigh")
        .withArgs(10_000, max);

      await expect(factory.connect(owner).deployVault(params({ performanceFeeBps: max })))
        .to.not.be.reverted;
    });

    it("rejects a zero position cap, which would revert every trade", async function () {
      const { factory, owner, params } = await loadFixture(deployFixture);

      await expect(
        factory.connect(owner).deployVault(params({ caps: { maxPositionSize: 0n } }))
      ).to.be.revertedWithCustomError(factory, "ZeroPositionCap");
    });

    it("rejects basis-point caps above 100%", async function () {
      const { factory, owner, params } = await loadFixture(deployFixture);

      await expect(
        factory.connect(owner).deployVault(params({ caps: { maxSingleAssetBps: 10_001 } }))
      )
        .to.be.revertedWithCustomError(factory, "BpsOutOfRange")
        .withArgs(10_001);

      await expect(
        factory.connect(owner).deployVault(params({ caps: { maxDrawdownBps: 10_001 } }))
      )
        .to.be.revertedWithCustomError(factory, "BpsOutOfRange")
        .withArgs(10_001);

      // Exactly 100% is permitted -- it means "no limit", which is a real
      // choice an operator may make, and the interface shows the number.
      await expect(
        factory.connect(owner).deployVault(
          params({ caps: { maxSingleAssetBps: 10_000, maxDrawdownBps: 10_000 } })
        )
      ).to.not.be.reverted;
    });

    it("rejects zero addresses for the trader and fee recipient", async function () {
      const { factory, owner, params } = await loadFixture(deployFixture);

      await expect(
        factory.connect(owner).deployVault(params({ trader: ethers.ZeroAddress }))
      ).to.be.revertedWithCustomError(factory, "ZeroAddressTrader");

      await expect(
        factory.connect(owner).deployVault(params({ feeRecipient: ethers.ZeroAddress }))
      ).to.be.revertedWithCustomError(factory, "ZeroAddressFeeRecipient");
    });

    it("rejects a zero base asset", async function () {
      const { factory, owner, params } = await loadFixture(deployFixture);

      await expect(
        factory.connect(owner).deployVault(params({ baseAsset: ethers.ZeroAddress }))
      ).to.be.revertedWithCustomError(factory, "ZeroAddressBaseAsset");
    });

    it("rejects a base asset that is not a token", async function () {
      const { factory, owner, outsider, params } = await loadFixture(deployFixture);

      // Vault's constructor reads decimals() off the base asset, so an
      // ordinary address cannot be passed off as one.
      await expect(factory.connect(owner).deployVault(params({ baseAsset: outsider.address })))
        .to.be.reverted;
    });
  });
});
