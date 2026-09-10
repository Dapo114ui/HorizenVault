import { VAULT_FACTORY_ADDRESS } from "./config";

/**
 * Demo mode renders the dashboard with clearly-labelled sample vaults when no
 * VaultFactory address is configured -- which is the case until the contracts
 * are deployed to Horizen (see ../../../docs/RESEARCH_NOTES.md).
 *
 * These numbers are illustrative only. Every surface that shows them also
 * shows that they are sample data, and all write actions are disabled, so
 * demo output is never mistakable for real on-chain activity.
 */
export const IS_DEMO = !VAULT_FACTORY_ADDRESS;

export type DemoVault = {
  address: `0x${string}`;
  name: string;
  shareSymbol: string;
  baseSymbol: string;
  strategy: string;
  /** All 1e18-scaled, matching the contracts' accounting. */
  nav: bigint;
  navPerShare: bigint;
  highWaterMark: bigint;
  sharesOutstanding: bigint;
  performanceFeeBps: number;
  trader: `0x${string}`;
  caps: {
    maxPositionSize: bigint;
    maxSingleAssetBps: number;
    maxDrawdownBps: number;
  };
};

const e18 = (whole: string): bigint => {
  const [int, frac = ""] = whole.split(".");
  return BigInt(int + frac.padEnd(18, "0").slice(0, 18));
};

export const DEMO_VAULTS: DemoVault[] = [
  {
    address: "0xDe0000000000000000000000000000000000A001",
    name: "Basis Carry",
    shareSymbol: "vECOM",
    baseSymbol: "USDC",
    strategy: "Basis capture, ETH perps vs spot",
    nav: e18("412500"),
    navPerShare: e18("1.184"),
    highWaterMark: e18("1.184"),
    sharesOutstanding: e18("348395"),
    performanceFeeBps: 2000,
    trader: "0x7ad0000000000000000000000000000000000a01",
    caps: {
      maxPositionSize: e18("50000"),
      maxSingleAssetBps: 4000,
      maxDrawdownBps: 1500,
    },
  },
  {
    address: "0xDe0000000000000000000000000000000000A002",
    name: "Stable Carry",
    shareSymbol: "vSTBC",
    baseSymbol: "USDC",
    strategy: "LP fee capture on stable pools",
    nav: e18("276000"),
    navPerShare: e18("1.041"),
    highWaterMark: e18("1.052"),
    sharesOutstanding: e18("265129"),
    performanceFeeBps: 1000,
    trader: "0x7ad0000000000000000000000000000000000a02",
    caps: {
      maxPositionSize: e18("40000"),
      maxSingleAssetBps: 2500,
      maxDrawdownBps: 500,
    },
  },
  {
    address: "0xDe0000000000000000000000000000000000A003",
    name: "cbBTC Accumulation",
    shareSymbol: "vCBAC",
    baseSymbol: "USDC",
    strategy: "Scheduled cbBTC accumulation with drawdown stop",
    nav: e18("98400"),
    navPerShare: e18("0.968"),
    highWaterMark: e18("1.113"),
    sharesOutstanding: e18("101652"),
    performanceFeeBps: 1500,
    trader: "0x7ad0000000000000000000000000000000000a03",
    caps: {
      maxPositionSize: e18("25000"),
      maxSingleAssetBps: 6000,
      maxDrawdownBps: 2000,
    },
  },
];

export function getDemoVault(address: string): DemoVault | undefined {
  return DEMO_VAULTS.find((v) => v.address.toLowerCase() === address.toLowerCase());
}

export const DEMO_TOTAL_NAV = DEMO_VAULTS.reduce((sum, v) => sum + v.nav, 0n);

export type DemoActivity = {
  kind: "Deposit" | "Withdraw" | "SwapExecuted";
  vault: string;
  detail: string;
  actor: string;
  ago: string;
};

export const DEMO_ACTIVITY: DemoActivity[] = [
  {
    kind: "Deposit",
    vault: "Basis Carry",
    detail: "12,000 USDC → 10,135 vECOM",
    actor: "0x7a41…19c2",
    ago: "2h ago",
  },
  {
    kind: "SwapExecuted",
    vault: "Basis Carry",
    detail: "18,000 USDC → 17,940 WETH",
    actor: "strategy",
    ago: "5h ago",
  },
  {
    kind: "Withdraw",
    vault: "Stable Carry",
    detail: "4,200 vSTBC → 4,372 USDC",
    actor: "0x2b09…8ef1",
    ago: "9h ago",
  },
  {
    kind: "SwapExecuted",
    vault: "cbBTC Accumulation",
    detail: "6,500 USDC → 6,431 WETH",
    actor: "strategy",
    ago: "1d ago",
  },
  {
    kind: "Deposit",
    vault: "Stable Carry",
    detail: "25,000 USDC → 24,015 vSTBC",
    actor: "0x9f13…44aa",
    ago: "2d ago",
  },
];

/** A sample connected position, so the Overview has something to show in preview. */
export const DEMO_POSITION = {
  shares: DEMO_VAULTS[0].sharesOutstanding / 40n,
  vaultIndex: 0,
};
