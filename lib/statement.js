/**
 * Off-chain mirror of the commitment scheme and statement encoding that
 * ConfidentialRiskManager implements on-chain.
 *
 * This exists twice on purpose. The prover has to construct exactly the
 * statement the contract will reconstruct, and a disagreement between them is
 * invisible in the worst way: a correct proof simply fails to verify, with no
 * indication of which side is wrong. Writing the encoding independently here
 * and asserting the two agree turns that class of bug into a failing test.
 *
 * It is also what the prover will actually call once the circuit compiles --
 * `commit` produces the witness's commitment and `publicInputs` the vector the
 * circuit declares.
 */

const { keccak256, sha256, toUtf8Bytes, concat, zeroPadValue, toBeHex } = require("ethers");
const { poseidon9 } = require("poseidon-lite");

/** BN254 scalar field modulus — the bound every public input must respect. */
const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Assets in the vault's declared universe. Must equal the circuit's N. */
const UNIVERSE_SIZE = 8;

/** Fixed by zkVerify's protocol, not chosen here. */
const PROVING_SYSTEM_ID = keccak256(toUtf8Bytes("groth16"));
const NO_VERSION_HASH = sha256("0x");

/**
 * Poseidon commitment to a position vector.
 *
 * The blinding factor is what makes this hiding rather than merely opaque:
 * quantities are drawn from a small, guessable space (round numbers, whole
 * units), so an unblinded commitment could be brute-forced by anyone willing
 * to enumerate plausible allocations. Blinding must be freshly random per
 * commitment and never reused — a repeated blinding across two commitments
 * leaks that the positions are equal.
 */
function commit(quantities, blinding) {
  if (quantities.length !== UNIVERSE_SIZE) {
    throw new Error(`expected ${UNIVERSE_SIZE} quantities, got ${quantities.length}`);
  }
  const inputs = [...quantities.map(BigInt), BigInt(blinding)];
  for (const x of inputs) {
    if (x < 0n || x >= FIELD_MODULUS) throw new Error(`not a field element: ${x}`);
  }
  return poseidon9(inputs);
}

/**
 * The circuit's public inputs, in the order it declares them. Mirrors
 * ConfidentialRiskManager.publicInputs.
 *
 * `sequence` is the value being consumed by this transition — the contract's
 * current `sequence`, before it increments.
 */
function publicInputs({
  vault,
  sequence,
  prevCommitment,
  newCommitment,
  nav,
  highWaterMark,
  maxPositionSize,
  maxSingleAssetBps,
  prices,
}) {
  if (prices.length !== UNIVERSE_SIZE) {
    throw new Error(`expected ${UNIVERSE_SIZE} prices, got ${prices.length}`);
  }
  return [
    BigInt(vault),
    BigInt(sequence),
    BigInt(prevCommitment),
    BigInt(newCommitment),
    BigInt(nav),
    BigInt(highWaterMark),
    BigInt(maxPositionSize),
    BigInt(maxSingleAssetBps),
    ...prices.map(BigInt),
  ];
}

/**
 * Public inputs as zkVerify encodes them: each field element as 32
 * little-endian bytes, concatenated. The EVM is big-endian everywhere, so
 * each word is reversed.
 */
function encodePublicInputs(inputs) {
  const words = inputs.map((x) => {
    const be = zeroPadValue(toBeHex(BigInt(x)), 32).slice(2);
    const bytes = be.match(/.{2}/g).reverse().join("");
    return "0x" + bytes;
  });
  return concat(words);
}

/** The leaf zkVerify records for this statement. */
function statementHash(vkHash, inputs) {
  return keccak256(
    concat([PROVING_SYSTEM_ID, vkHash, NO_VERSION_HASH, keccak256(encodePublicInputs(inputs))])
  );
}

module.exports = {
  FIELD_MODULUS,
  UNIVERSE_SIZE,
  PROVING_SYSTEM_ID,
  NO_VERSION_HASH,
  commit,
  publicInputs,
  encodePublicInputs,
  statementHash,
};
