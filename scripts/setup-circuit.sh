#!/usr/bin/env bash
#
# Compiles the risk-caps circuit and runs a Groth16 setup, so `node
# scripts/prove.js` can generate a proof.
#
# THE CEREMONY THIS RUNS IS FOR DEVELOPMENT ONLY. It generates the toxic waste
# locally and throws away nothing: whoever runs this script could forge proofs
# against the resulting key. That is fine for a laptop and disqualifying for
# anything holding real money. Production needs a multi-party ceremony where no
# single participant sees the whole secret, and Phase 1 should come from an
# existing public powers-of-tau file rather than one generated here.
#
# Requires the circom compiler on PATH, or CIRCOM pointing at it.
# Build it with:
#   git clone --depth 1 https://github.com/iden3/circom.git
#   cd circom && cargo build --release      # ~1 minute
#   export CIRCOM=$PWD/target/release/circom
set -euo pipefail

CIRCOM="${CIRCOM:-circom}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build/circuits"
SNARKJS="npx snarkjs"

# 2^13 = 8192, comfortably above the circuit's ~4.5k constraints. Raising the
# universe size or the comparator bit-width will need a larger power.
POWER=13

if ! command -v "$CIRCOM" >/dev/null 2>&1 && [ ! -x "$CIRCOM" ]; then
  echo "circom not found. Set CIRCOM to the compiler binary — see the header of this script." >&2
  exit 1
fi

mkdir -p "$BUILD"
cd "$ROOT"

echo "==> Compiling circuit"
"$CIRCOM" circuits/risk_caps.circom --r1cs --wasm --sym -l node_modules -o "$BUILD"

cd "$BUILD"

echo "==> Phase 1 (universal)"
$SNARKJS powersoftau new bn128 "$POWER" pot_0.ptau
$SNARKJS powersoftau contribute pot_0.ptau pot_1.ptau \
  --name="dev-phase1" -e="$(head -c 64 /dev/urandom | base64)"
$SNARKJS powersoftau prepare phase2 pot_1.ptau pot_final.ptau

echo "==> Phase 2 (circuit-specific)"
$SNARKJS groth16 setup risk_caps.r1cs pot_final.ptau risk_caps_0.zkey
$SNARKJS zkey contribute risk_caps_0.zkey risk_caps_final.zkey \
  --name="dev-phase2" -e="$(head -c 64 /dev/urandom | base64)"
$SNARKJS zkey export verificationkey risk_caps_final.zkey verification_key.json

echo
echo "Done. Now run:  node scripts/prove.js"
echo "Reminder: this key is development-only — see the warning at the top of this script."
