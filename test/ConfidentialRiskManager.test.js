const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const {
  UNIVERSE_SIZE,
  FIELD_MODULUS,
  commit,
  publicInputs,
  statementHash,
} = require("../lib/statement");

const VK_HASH = "0x" + "ab".repeat(32);
const ONE = 10n ** 18n;

// A plausible starting book: two of the eight assets held, six empty. A zero
// quantity is indistinguishable from any other hidden quantity, which is what
// keeps "which assets is it actually in" private.
const QUANTITIES_A = [400n * ONE, 250n * ONE, 0n, 0n, 0n, 0n, 0n, 0n];
const QUANTITIES_B = [300n * ONE, 350n * ONE, 0n, 0n, 0n, 0n, 0n, 0n];
const BLINDING_A = 987654321n;
const BLINDING_B = 123456789n;

// $1.00 for every asset, so NAV arithmetic in the tests stays legible.
const PRICES = Array(UNIVERSE_SIZE).fill(ONE);

const CAPS = {
  maxPositionSize: 500n * ONE * ONE, // quantity * price, so 1e18 * 1e18 scale
  maxSingleAssetBps: 6000n,
  maxDrawdownBps: 2000n,
};

function navOf(quantities) {
  return quantities.reduce((acc, q, i) => acc + q * PRICES[i], 0n);
}

async function fixture() {
  const [owner, vaultSigner, stranger] = await ethers.getSigners();

  const MockProofAggregation = await ethers.getContractFactory("MockProofAggregation");
  const zkVerify = await MockProofAggregation.deploy();

  const initialCommitment = commit(QUANTITIES_A, BLINDING_A);

  const ConfidentialRiskManager = await ethers.getContractFactory("ConfidentialRiskManager");
  // `vaultSigner` stands in for the Vault contract, so the test can call
  // through the onlyVault gate the way the vault will.
  const crm = await ConfidentialRiskManager.deploy(
    owner.address,
    await zkVerify.getAddress(),
    vaultSigner.address,
    CAPS,
    initialCommitment,
    VK_HASH
  );

  return { owner, vaultSigner, stranger, zkVerify, crm, initialCommitment };
}

/** Build the statement for a transition, exactly as the prover would. */
async function statementFor(crm, vaultAddress, { newCommitment, nav, highWaterMark }) {
  const inputs = publicInputs({
    vault: vaultAddress,
    sequence: await crm.sequence(),
    prevCommitment: await crm.stateCommitment(),
    newCommitment,
    nav,
    highWaterMark,
    maxPositionSize: CAPS.maxPositionSize,
    maxSingleAssetBps: CAPS.maxSingleAssetBps,
    prices: PRICES,
  });
  return { inputs, leaf: statementHash(VK_HASH, inputs) };
}

const NO_ATTESTATION = {
  domainId: 1n,
  aggregationId: 42n,
  merklePath: [],
  leafCount: 1n,
  index: 0n,
};

describe("Statement encoding", function () {
  it("agrees with the on-chain encoding, word for word", async function () {
    const { crm, vaultSigner } = await loadFixture(fixture);

    const newCommitment = commit(QUANTITIES_B, BLINDING_B);
    const nav = navOf(QUANTITIES_B);
    const { inputs } = await statementFor(crm, vaultSigner.address, {
      newCommitment,
      nav,
      highWaterMark: nav,
    });

    // The ordering is the part that silently breaks a prover, so assert the
    // contract builds the identical vector rather than only the same digest.
    const onChainInputs = await crm.publicInputs(newCommitment, nav, nav, PRICES);
    expect(onChainInputs.map((x) => BigInt(x))).to.deep.equal(inputs);

    expect(await crm.encodePublicInputs(inputs)).to.equal(
      require("../lib/statement").encodePublicInputs(inputs)
    );
    expect(await crm.statementHash(VK_HASH, inputs)).to.equal(statementHash(VK_HASH, inputs));
  });

  it("produces a different statement for every field it binds", async function () {
    const { crm, vaultSigner } = await loadFixture(fixture);

    const newCommitment = commit(QUANTITIES_B, BLINDING_B);
    const nav = navOf(QUANTITIES_B);
    const base = publicInputs({
      vault: vaultSigner.address,
      sequence: 0n,
      prevCommitment: await crm.stateCommitment(),
      newCommitment,
      nav,
      highWaterMark: nav,
      maxPositionSize: CAPS.maxPositionSize,
      maxSingleAssetBps: CAPS.maxSingleAssetBps,
      prices: PRICES,
    });
    const baseLeaf = statementHash(VK_HASH, base);

    // Every public input must move the leaf. A field that does not is a field
    // an attacker may vary freely while reusing someone else's proof.
    for (let i = 0; i < base.length; i++) {
      const mutated = [...base];
      mutated[i] = mutated[i] + 1n;
      expect(statementHash(VK_HASH, mutated), `input ${i} does not bind`).to.not.equal(baseLeaf);
    }
  });
});

describe("ConfidentialRiskManager", function () {
  describe("advancing state", function () {
    it("accepts a proof zkVerify vouched for and advances the commitment", async function () {
      const { crm, zkVerify, vaultSigner, initialCommitment } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const nav = navOf(QUANTITIES_B);
      const { leaf } = await statementFor(crm, vaultSigner.address, {
        newCommitment,
        nav,
        highWaterMark: nav,
      });
      await zkVerify.accept(leaf);

      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION)
      )
        .to.emit(crm, "StateAdvanced")
        .withArgs(1n, initialCommitment, newCommitment, nav);

      expect(await crm.stateCommitment()).to.equal(newCommitment);
      expect(await crm.attestedNav()).to.equal(nav);
      expect(await crm.sequence()).to.equal(1n);
    });

    it("rejects a statement zkVerify has not aggregated", async function () {
      const { crm, vaultSigner } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const nav = navOf(QUANTITIES_B);

      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "ProofRejected");

      expect(await crm.stateCommitment()).to.equal(await crm.stateCommitment());
      expect(await crm.sequence()).to.equal(0n);
    });

    it("leaves state untouched when a proof is refused", async function () {
      const { crm, vaultSigner, initialCommitment } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const nav = navOf(QUANTITIES_B);
      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION)
      ).to.be.reverted;

      expect(await crm.stateCommitment()).to.equal(initialCommitment);
      expect(await crm.attestedNav()).to.equal(0n);
    });
  });

  describe("replay resistance", function () {
    it("refuses the same proof a second time", async function () {
      const { crm, zkVerify, vaultSigner } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const nav = navOf(QUANTITIES_B);
      const { leaf } = await statementFor(crm, vaultSigner.address, {
        newCommitment,
        nav,
        highWaterMark: nav,
      });
      await zkVerify.accept(leaf);

      await crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION);

      // The commitment guard catches this one first; the sequence number is
      // what catches it once the positions have moved on. Both matter.
      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "CommitmentUnchanged");
    });

    it("refuses a proof reused after trading back to an earlier position", async function () {
      const { crm, zkVerify, vaultSigner, initialCommitment } = await loadFixture(fixture);

      const commitmentB = commit(QUANTITIES_B, BLINDING_B);
      const navB = navOf(QUANTITIES_B);

      // The proof that took the vault A -> B, recorded before it is used.
      const stepOne = await statementFor(crm, vaultSigner.address, {
        newCommitment: commitmentB,
        nav: navB,
        highWaterMark: navB,
      });
      await zkVerify.accept(stepOne.leaf);
      await crm.connect(vaultSigner).advanceState(commitmentB, navB, navB, PRICES, NO_ATTESTATION);

      // Now go back: B -> A. Commitment chaining alone would be satisfied by
      // the original A -> B proof once the vault sits at A again.
      const navA = navOf(QUANTITIES_A);
      const stepTwo = await statementFor(crm, vaultSigner.address, {
        newCommitment: initialCommitment,
        nav: navA,
        highWaterMark: navB,
      });
      await zkVerify.accept(stepTwo.leaf);
      await crm
        .connect(vaultSigner)
        .advanceState(initialCommitment, navA, navB, PRICES, NO_ATTESTATION);

      expect(await crm.stateCommitment()).to.equal(initialCommitment);
      expect(await crm.sequence()).to.equal(2n);

      // The vault is back at commitment A with the same caps and prices, so
      // every public input of the original A -> B statement matches again --
      // except the sequence number, which is now 2 rather than 0. Only the
      // old leaf is accepted by zkVerify, so this must fail.
      await expect(
        crm.connect(vaultSigner).advanceState(commitmentB, navB, navB, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "ProofRejected");

      const replayed = await statementFor(crm, vaultSigner.address, {
        newCommitment: commitmentB,
        nav: navB,
        highWaterMark: navB,
      });
      expect(replayed.leaf).to.not.equal(stepOne.leaf);
    });

    it("refuses a proof minted for a different vault", async function () {
      const { crm, zkVerify, vaultSigner, stranger } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const nav = navOf(QUANTITIES_B);

      // Same circuit, same caps, same transition -- but proven against
      // another vault's address.
      const foreign = publicInputs({
        vault: stranger.address,
        sequence: 0n,
        prevCommitment: await crm.stateCommitment(),
        newCommitment,
        nav,
        highWaterMark: nav,
        maxPositionSize: CAPS.maxPositionSize,
        maxSingleAssetBps: CAPS.maxSingleAssetBps,
        prices: PRICES,
      });
      await zkVerify.accept(statementHash(VK_HASH, foreign));

      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "ProofRejected");
    });

    it("refuses a proof minted under looser caps", async function () {
      const { crm, zkVerify, owner, vaultSigner } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const nav = navOf(QUANTITIES_B);

      // Prove against a 90% exposure cap, then tighten to 60% on-chain.
      const loose = publicInputs({
        vault: vaultSigner.address,
        sequence: 0n,
        prevCommitment: await crm.stateCommitment(),
        newCommitment,
        nav,
        highWaterMark: nav,
        maxPositionSize: CAPS.maxPositionSize,
        maxSingleAssetBps: 9000n,
        prices: PRICES,
      });
      await zkVerify.accept(statementHash(VK_HASH, loose));

      await crm.connect(owner).setCaps({ ...CAPS, maxSingleAssetBps: 6000n });

      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, nav, nav, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "ProofRejected");
    });
  });

  describe("checks made in the clear", function () {
    it("rejects a drawdown past the cap without consulting the proof", async function () {
      const { crm, vaultSigner } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const highWaterMark = 1000n * ONE * ONE;
      const floor = (highWaterMark * (10000n - CAPS.maxDrawdownBps)) / 10000n;

      await expect(
        crm
          .connect(vaultSigner)
          .advanceState(newCommitment, floor - 1n, highWaterMark, PRICES, NO_ATTESTATION)
      )
        .to.be.revertedWithCustomError(crm, "DrawdownExceeded")
        .withArgs(floor - 1n, floor);
    });

    it("allows NAV sitting exactly on the drawdown floor", async function () {
      const { crm, zkVerify, vaultSigner } = await loadFixture(fixture);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      const highWaterMark = 1000n * ONE * ONE;
      const floor = (highWaterMark * (10000n - CAPS.maxDrawdownBps)) / 10000n;

      const { leaf } = await statementFor(crm, vaultSigner.address, {
        newCommitment,
        nav: floor,
        highWaterMark,
      });
      await zkVerify.accept(leaf);

      await expect(
        crm
          .connect(vaultSigner)
          .advanceState(newCommitment, floor, highWaterMark, PRICES, NO_ATTESTATION)
      ).to.emit(crm, "StateAdvanced");
    });
  });

  describe("input guards", function () {
    it("only lets the vault advance state", async function () {
      const { crm, stranger } = await loadFixture(fixture);
      const newCommitment = commit(QUANTITIES_B, BLINDING_B);

      await expect(
        crm.connect(stranger).advanceState(newCommitment, 1n, 1n, PRICES, NO_ATTESTATION)
      )
        .to.be.revertedWithCustomError(crm, "OnlyVault")
        .withArgs(stranger.address);
    });

    it("rejects a price vector of the wrong length", async function () {
      const { crm, vaultSigner } = await loadFixture(fixture);
      const newCommitment = commit(QUANTITIES_B, BLINDING_B);

      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, 1n, 1n, PRICES.slice(1), NO_ATTESTATION)
      )
        .to.be.revertedWithCustomError(crm, "PriceVectorLength")
        .withArgs(7n, 8n);
    });

    it("rejects a commitment at or above the field modulus", async function () {
      const { crm, vaultSigner } = await loadFixture(fixture);

      // Above the modulus the proof system reads a wrapped value, so the
      // contract would be storing one number while the proof attests another.
      await expect(
        crm.connect(vaultSigner).advanceState(FIELD_MODULUS, 1n, 1n, PRICES, NO_ATTESTATION)
      )
        .to.be.revertedWithCustomError(crm, "NotAFieldElement")
        .withArgs(FIELD_MODULUS);
    });

    it("rejects a transition that does not move the commitment", async function () {
      const { crm, vaultSigner, initialCommitment } = await loadFixture(fixture);

      await expect(
        crm.connect(vaultSigner).advanceState(initialCommitment, 1n, 1n, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "CommitmentUnchanged");
    });

    it("refuses to verify anything while no verification key is set", async function () {
      const { crm, owner, vaultSigner } = await loadFixture(fixture);
      await crm.connect(owner).setVerificationKey(ethers.ZeroHash);

      const newCommitment = commit(QUANTITIES_B, BLINDING_B);
      await expect(
        crm.connect(vaultSigner).advanceState(newCommitment, 1n, 1n, PRICES, NO_ATTESTATION)
      ).to.be.revertedWithCustomError(crm, "VerificationKeyUnset");
    });

    it("only lets the owner change the verification key or the caps", async function () {
      const { crm, stranger } = await loadFixture(fixture);

      await expect(
        crm.connect(stranger).setVerificationKey("0x" + "cd".repeat(32))
      ).to.be.revertedWithCustomError(crm, "OwnableUnauthorizedAccount");

      await expect(crm.connect(stranger).setCaps(CAPS)).to.be.revertedWithCustomError(
        crm,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("commitment scheme", function () {
    it("hides equal positions behind different blindings", async function () {
      // Two identical books must not produce the same commitment, or an
      // observer learns the vault returned to a position it held before.
      expect(commit(QUANTITIES_A, BLINDING_A)).to.not.equal(commit(QUANTITIES_A, BLINDING_B));
    });

    it("binds every position in the vector", async function () {
      const base = commit(QUANTITIES_A, BLINDING_A);
      for (let i = 0; i < UNIVERSE_SIZE; i++) {
        const moved = [...QUANTITIES_A];
        moved[i] += 1n;
        expect(commit(moved, BLINDING_A), `slot ${i} does not bind`).to.not.equal(base);
      }
    });
  });
});
