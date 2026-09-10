/**
 * Generates one real proof for the risk-caps circuit, verifies it, and checks
 * that the public signals the circuit emits are exactly the vector
 * `ConfidentialRiskManager.publicInputs` builds.
 *
 * That last check is the point of this script. A proof that verifies against
 * snarkjs but whose public signals are ordered differently from the contract's
 * would fail on-chain with no diagnostic beyond "rejected" — this catches it
 * here, where the error message is useful.
 *
 * Prerequisites, produced by `npm run circuit:setup` (see README):
 *   build/circuits/risk_caps_js/risk_caps.wasm
 *   build/circuits/risk_caps_final.zkey
 *   build/circuits/verification_key.json
 *
 * Usage: node scripts/prove.js
 */
const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

const { commit, publicInputs, statementHash, UNIVERSE_SIZE } = require("../lib/statement");

const BUILD = path.join(__dirname, "..", "build", "circuits");
const WASM = path.join(BUILD, "risk_caps_js", "risk_caps.wasm");
const ZKEY = path.join(BUILD, "risk_caps_final.zkey");
const VKEY = path.join(BUILD, "verification_key.json");

const ONE = 10n ** 18n;

// A book the vault might hold: two positions of the eight-asset universe,
// six empty. Every quantity is private; only the commitment is published.
const QUANTITIES = [300n * ONE, 350n * ONE, 0n, 0n, 0n, 0n, 0n, 0n];
const BLINDING = 123456789n;
const PRICES = Array(UNIVERSE_SIZE).fill(ONE); // $1.00 each, for legible arithmetic

const CAPS = {
  maxPositionSize: 500n * ONE * ONE,
  maxSingleAssetBps: 6000n,
};

// Stand-ins for on-chain state. In production these are read from the
// contract; the point here is that the prover must use the contract's current
// values or the statement will not match.
const VAULT = 0x1111111111111111111111111111111111111111n;
const SEQUENCE = 0n;
const PREV_COMMITMENT = commit([100n * ONE, 0n, 0n, 0n, 0n, 0n, 0n, 0n], 987654321n);

function nav(quantities, prices) {
  return quantities.reduce((acc, q, i) => acc + q * prices[i], 0n);
}

async function main() {
  for (const f of [WASM, ZKEY, VKEY]) {
    if (!fs.existsSync(f)) {
      throw new Error(`missing ${path.relative(process.cwd(), f)} — run the circuit setup first`);
    }
  }

  const newCommitment = commit(QUANTITIES, BLINDING);
  const navValue = nav(QUANTITIES, PRICES);
  const highWaterMark = navValue;

  const input = {
    vault: VAULT.toString(),
    sequence: SEQUENCE.toString(),
    prevCommitment: PREV_COMMITMENT.toString(),
    newCommitment: newCommitment.toString(),
    nav: navValue.toString(),
    highWaterMark: highWaterMark.toString(),
    maxPositionSize: CAPS.maxPositionSize.toString(),
    maxSingleAssetBps: CAPS.maxSingleAssetBps.toString(),
    prices: PRICES.map(String),
    quantities: QUANTITIES.map(String),
    blinding: BLINDING.toString(),
  };

  console.log("Proving…");
  const started = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  const elapsed = Date.now() - started;

  const vkey = JSON.parse(fs.readFileSync(VKEY, "utf8"));
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("proof failed to verify");

  // The circuit's public signals must equal the contract's public-input
  // vector, element for element and in the same order.
  const expected = publicInputs({
    vault: VAULT,
    sequence: SEQUENCE,
    prevCommitment: PREV_COMMITMENT,
    newCommitment,
    nav: navValue,
    highWaterMark,
    maxPositionSize: CAPS.maxPositionSize,
    maxSingleAssetBps: CAPS.maxSingleAssetBps,
    prices: PRICES,
  });
  const actual = publicSignals.map(BigInt);

  if (actual.length !== expected.length) {
    throw new Error(`public signal count: circuit ${actual.length}, contract ${expected.length}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`public signal ${i}: circuit ${actual[i]}, contract ${expected[i]}`);
    }
  }

  fs.writeFileSync(path.join(BUILD, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(BUILD, "public.json"), JSON.stringify(publicSignals, null, 2));

  console.log(`\nProof verified in ${elapsed}ms.`);
  console.log(`Public signals:   ${actual.length}, matching the contract vector exactly`);
  console.log(`Commitment:       ${newCommitment}`);
  console.log(`Attested NAV:     ${navValue}`);
  console.log(`Quantities:       private — never leave this process`);
  console.log(
    `\nStatement hash (against a placeholder vkHash):\n  ${statementHash("0x" + "ab".repeat(32), expected)}`
  );
  console.log(
    "\nNote: the vkHash zkVerify derives from a registered verification key is\n" +
      "not necessarily this placeholder. Register the key with zkVerify and use\n" +
      "the hash they return before submitting anything on-chain."
  );

  await provingABreachFails(navValue, highWaterMark);
}

/**
 * The confidentiality is worthless if the caps are not actually enforced, and
 * a circuit that happily proves anything looks identical from outside to one
 * that constrains properly. So: take a book that breaches the position cap and
 * confirm no proof exists for it.
 *
 * The failure surfaces during witness generation rather than proving —
 * circom's constraint assertions fire as the witness is computed — which is
 * why this catches around fullProve rather than checking a verify() result.
 */
async function provingABreachFails(navValue, highWaterMark) {
  const breaching = [600n * ONE, 50n * ONE, 0n, 0n, 0n, 0n, 0n, 0n];
  const breachingValue = breaching[0] * PRICES[0];
  if (breachingValue <= CAPS.maxPositionSize) {
    throw new Error("test book does not actually breach the cap — fix the fixture");
  }

  const input = {
    vault: VAULT.toString(),
    sequence: SEQUENCE.toString(),
    prevCommitment: PREV_COMMITMENT.toString(),
    newCommitment: commit(breaching, BLINDING).toString(),
    nav: nav(breaching, PRICES).toString(),
    highWaterMark: highWaterMark.toString(),
    maxPositionSize: CAPS.maxPositionSize.toString(),
    maxSingleAssetBps: CAPS.maxSingleAssetBps.toString(),
    prices: PRICES.map(String),
    quantities: breaching.map(String),
    blinding: BLINDING.toString(),
  };

  console.log("\nAttempting to prove a book that breaches the position cap…");
  try {
    await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  } catch (err) {
    console.log("  Refused, as it must be. The circuit enforces the cap.");
    console.log(`  (${String(err.message ?? err).split("\n")[0]})`);
    return;
  }
  throw new Error(
    "a breaching book produced a proof — the caps are not constrained, and " +
      "every guarantee this protocol makes to depositors is void"
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
