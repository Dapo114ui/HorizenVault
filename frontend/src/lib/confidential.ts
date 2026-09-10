import { ACTIVE_CHAIN_ID } from "./config";

/**
 * The confidential layer's read model.
 *
 * `ConfidentialRiskManager` replaces reading balances with proving statements
 * about them: the vault publishes a commitment to its position quantities
 * instead of the quantities, and advances that commitment only against a
 * zero-knowledge proof verified on zkVerify.
 *
 * Every field below is something the contract publishes on-chain. There is
 * deliberately no field for the positions themselves -- not because the
 * frontend chooses not to show them, but because nothing on-chain knows them.
 * If a future version of this file gains a `positions` field, the privacy is
 * gone and the reason should be a very good one.
 */

export const CONFIDENTIAL_RISK_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_CONFIDENTIAL_RISK_MANAGER_ADDRESS as `0x${string}` | undefined;

/** No ConfidentialRiskManager is deployed yet, so this is preview data. */
export const IS_SEALED_PREVIEW = !CONFIDENTIAL_RISK_MANAGER_ADDRESS;

export type SealedState = {
  /** Poseidon commitment to the hidden quantities, as a field element. */
  stateCommitment: bigint;
  /** Transitions proven so far. Also what makes each proof unreusable. */
  sequence: bigint;
  /** NAV the last proof attested to, in base-asset units. */
  attestedNav: bigint;
  highWaterMark: bigint;
  /** Verification key hash of the circuit currently accepted. */
  vkHash: `0x${string}`;
  caps: {
    maxPositionSize: bigint;
    maxSingleAssetBps: number;
    maxDrawdownBps: number;
  };
  /** Assets the vault is permitted to hold. Public — see the note below. */
  universe: string[];
  baseSymbol: string;
};

export type ProofStep = {
  sequence: bigint;
  commitment: bigint;
  nav: bigint;
  at: string;
};

const e18 = (whole: string): bigint => {
  const [int, frac = ""] = whole.split(".");
  return BigInt(int + frac.padEnd(18, "0").slice(0, 18));
};

/**
 * Illustrative only, and labelled as such everywhere it surfaces. The
 * commitment is a real Poseidon output from `npm run circuit:prove` rather
 * than a random-looking number, so the digits on screen are the digits the
 * circuit actually produces for a book of this shape.
 */
export const PREVIEW_SEALED_STATE: SealedState = {
  stateCommitment:
    7062329139916628317220646750309562088392543967780659528482424530430147417665n,
  sequence: 4n,
  attestedNav: e18("650000"),
  highWaterMark: e18("664200"),
  vkHash: "0xab00000000000000000000000000000000000000000000000000000000000000ab",
  caps: {
    maxPositionSize: e18("500000"),
    maxSingleAssetBps: 6000,
    maxDrawdownBps: 2000,
  },
  universe: ["USDC", "WETH", "cbBTC", "ZEN", "wstETH", "rETH", "USDe", "sUSDe"],
  baseSymbol: "USDC",
};

export const PREVIEW_PROOF_HISTORY: ProofStep[] = [
  {
    sequence: 4n,
    commitment:
      7062329139916628317220646750309562088392543967780659528482424530430147417665n,
    nav: e18("650000"),
    at: "2 hours ago",
  },
  {
    sequence: 3n,
    commitment:
      19_115_884_402_776_509_119_223_099_301_889_144_291_934_478_770_332_113_886n,
    nav: e18("664200"),
    at: "9 hours ago",
  },
  {
    sequence: 2n,
    commitment:
      4_402_776_509_119_223_099_301_889_144_291_934_478_770_332_113_886_115_884n,
    nav: e18("641850"),
    at: "yesterday",
  },
  {
    sequence: 1n,
    commitment:
      11_922_309_930_188_914_429_193_447_877_033_211_388_611_588_440_277_650n,
    nav: e18("612400"),
    at: "3 days ago",
  },
];

/** zkVerify's explorer, for a proof's aggregation. Testnet only for now. */
export function zkVerifyNote(): string {
  return ACTIVE_CHAIN_ID === 26514
    ? "Proofs are verified on zkVerify and consumed here as aggregation attestations."
    : "Proofs are verified on zkVerify and consumed here as aggregation attestations. On a test network the aggregation may lag by a few minutes.";
}
