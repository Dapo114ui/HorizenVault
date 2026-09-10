"use client";

import Link from "next/link";
import { useReadContracts } from "wagmi";
import { vaultAbi, erc20Abi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID } from "@/lib/config";
import { formatBps, formatCompact, formatToken, shortenAddress, drawdownBps } from "@/lib/format";
import { SampleTag } from "./DemoBanner";
import type { DemoVault } from "@/lib/demo";

type CardData = {
  address: string;
  name?: string;
  shareSymbol?: string;
  baseSymbol?: string;
  /** NAV is denominated in the base asset's own units, not always 18. */
  baseDecimals?: number;
  strategy?: string;
  nav?: bigint;
  navPerShare?: bigint;
  highWaterMark?: bigint;
  sharesOutstanding?: bigint;
  performanceFeeBps?: number;
  isSample?: boolean;
};

function VaultCardView({ data }: { data: CardData }) {
  const dd =
    data.navPerShare !== undefined && data.highWaterMark !== undefined
      ? drawdownBps(data.navPerShare, data.highWaterMark)
      : 0;

  return (
    <Link
      href={`/vault/${data.address}`}
      className="group block rounded-xl border border-border-subtle bg-surface-1 p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{data.name ?? "Vault"}</h3>
            {data.isSample && <SampleTag />}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {data.strategy ?? shortenAddress(data.address)}
          </p>
        </div>
        {data.shareSymbol && (
          <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-ink-secondary">
            {data.shareSymbol}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-ink">
          {formatCompact(data.nav, data.baseDecimals ?? 18)}
        </span>
        <span className="text-sm text-ink-muted">{data.baseSymbol ?? ""} TVL</span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-4 text-sm">
        <div>
          <dt className="text-xs text-ink-muted">NAV / share</dt>
          <dd className="tabular mt-0.5 text-ink">{formatToken(data.navPerShare, 18, 3)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Perf. fee</dt>
          <dd className="tabular mt-0.5 text-ink">{formatBps(data.performanceFeeBps)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">vs. peak</dt>
          <dd className="tabular mt-0.5 flex items-center gap-1.5 text-ink">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dd > 0 ? "bg-warning" : "bg-good"}`}
            />
            {dd > 0 ? `−${(dd / 100).toFixed(1)}%` : "At peak"}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

export function DemoVaultCard({ vault }: { vault: DemoVault }) {
  return (
    <VaultCardView
      data={{
        address: vault.address,
        name: vault.name,
        shareSymbol: vault.shareSymbol,
        baseSymbol: vault.baseSymbol,
        baseDecimals: 18,
        strategy: vault.strategy,
        nav: vault.nav,
        navPerShare: vault.navPerShare,
        highWaterMark: vault.highWaterMark,
        sharesOutstanding: vault.sharesOutstanding,
        performanceFeeBps: vault.performanceFeeBps,
        isSample: true,
      }}
    />
  );
}

export function VaultCard({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { data: tokens } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: vaultAbi, functionName: "shareToken", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "baseAsset", chainId: ACTIVE_CHAIN_ID },
    ],
  });

  const [shareTokenAddress, baseAssetAddress] = (tokens?.map((d) => d.result) ?? []) as [
    `0x${string}` | undefined,
    `0x${string}` | undefined,
  ];

  const { data } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: vaultAbi, functionName: "nav", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "navPerShare", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "highWaterMark", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "performanceFeeBps", chainId: ACTIVE_CHAIN_ID },
      { address: shareTokenAddress, abi: erc20Abi, functionName: "symbol", chainId: ACTIVE_CHAIN_ID },
      { address: shareTokenAddress, abi: erc20Abi, functionName: "totalSupply", chainId: ACTIVE_CHAIN_ID },
      { address: baseAssetAddress, abi: erc20Abi, functionName: "symbol", chainId: ACTIVE_CHAIN_ID },
      { address: baseAssetAddress, abi: erc20Abi, functionName: "decimals", chainId: ACTIVE_CHAIN_ID },
    ],
    query: { enabled: Boolean(shareTokenAddress && baseAssetAddress) },
  });

  const [
    nav,
    navPerShare,
    highWaterMark,
    performanceFeeBps,
    shareSymbol,
    totalSupply,
    baseSymbol,
    baseDecimals,
  ] = (data?.map((d) => d.result) ?? []) as [
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    string | undefined,
    bigint | undefined,
    string | undefined,
    number | undefined,
  ];

  return (
    <VaultCardView
      data={{
        address: vaultAddress,
        name: shareSymbol ? `${shareSymbol} vault` : "Vault",
        shareSymbol,
        baseSymbol,
        baseDecimals,
        strategy: shortenAddress(vaultAddress),
        nav,
        navPerShare,
        highWaterMark,
        sharesOutstanding: totalSupply,
        performanceFeeBps:
          performanceFeeBps !== undefined ? Number(performanceFeeBps) : undefined,
      }}
    />
  );
}
