"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, riskManagerAbi, strategyExecutorAbi, vaultAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID } from "@/lib/config";

const ZERO = "0x0000000000000000000000000000000000000000";

/** How far to probe the vault's `trackedAssets` array, which has no length getter. */
const MAX_TRACKED = 8;

export type Token = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** Vault's own holding, in the token's units. */
  balance: bigint;
  isBase: boolean;
};

/**
 * Everything a trade form needs about one vault: who may trade it, which
 * tokens it can hold, what it currently holds of each, and its risk caps.
 */
export function useTradeContext(vaultAddress: `0x${string}`) {
  const { address: connected, isConnected } = useAccount();
  const at = { chainId: ACTIVE_CHAIN_ID } as const;

  const { data: core } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: vaultAbi, functionName: "baseAsset", ...at },
      { address: vaultAddress, abi: vaultAbi, functionName: "strategyExecutor", ...at },
      { address: vaultAddress, abi: vaultAbi, functionName: "riskManager", ...at },
      { address: vaultAddress, abi: vaultAbi, functionName: "router", ...at },
      { address: vaultAddress, abi: vaultAbi, functionName: "nav", ...at },
      { address: vaultAddress, abi: vaultAbi, functionName: "baseDecimals", ...at },
    ],
  });

  const [baseAsset, executor, riskManager, router, nav, baseDecimals] = (core?.map(
    (d) => d.result
  ) ?? []) as [
    `0x${string}` | undefined,
    `0x${string}` | undefined,
    `0x${string}` | undefined,
    `0x${string}` | undefined,
    bigint | undefined,
    number | undefined,
  ];

  const { data: trader } = useReadContract({
    address: executor,
    abi: strategyExecutorAbi,
    functionName: "trader",
    ...at,
    query: { enabled: Boolean(executor) },
  });

  const { data: caps } = useReadContract({
    address: riskManager,
    abi: riskManagerAbi,
    functionName: "caps",
    ...at,
    query: { enabled: Boolean(riskManager) },
  });

  // `trackedAssets` is a public array with no length getter, so probe indices
  // and stop at the first that reverts.
  const { data: trackedRaw } = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: MAX_TRACKED }, (_, i) => ({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: "trackedAssets" as const,
      args: [BigInt(i)] as const,
      ...at,
    })),
  });

  const trackedAddresses: `0x${string}`[] = [];
  for (const entry of trackedRaw ?? []) {
    if (entry.status !== "success") break;
    trackedAddresses.push(entry.result as `0x${string}`);
  }

  const tokenAddresses = [
    ...(baseAsset ? [baseAsset] : []),
    ...trackedAddresses.filter((a) => a.toLowerCase() !== baseAsset?.toLowerCase()),
  ];

  const { data: tokenData } = useReadContracts({
    contracts: tokenAddresses.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol" as const, ...at },
      { address, abi: erc20Abi, functionName: "decimals" as const, ...at },
      {
        address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [vaultAddress] as const,
        ...at,
      },
    ]),
    query: { enabled: tokenAddresses.length > 0 },
  });

  const tokens: Token[] = tokenAddresses.map((address, i) => ({
    address,
    symbol: (tokenData?.[i * 3]?.result as string | undefined) ?? "…",
    decimals: (tokenData?.[i * 3 + 1]?.result as number | undefined) ?? 18,
    balance: (tokenData?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n,
    isBase: address.toLowerCase() === baseAsset?.toLowerCase(),
  }));

  const isTrader = Boolean(
    connected && trader && connected.toLowerCase() === (trader as string).toLowerCase()
  );

  return {
    isConnected,
    connected,
    baseAsset,
    baseDecimals,
    executor,
    riskManager,
    router,
    nav,
    trader: trader as `0x${string}` | undefined,
    isTrader,
    caps: caps
      ? {
          maxPositionSize: caps[0],
          maxSingleAssetBps: Number(caps[1]),
          maxDrawdownBps: Number(caps[2]),
        }
      : undefined,
    tokens,
    /** A vault wired to the zero router can never trade, by construction. */
    canTrade: Boolean(router && router !== ZERO),
    /** Only the base asset is held, so there is nothing to trade into yet. */
    hasTrackedAssets: trackedAddresses.length > 0,
  };
}
