"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { DemoBanner, SampleTag } from "@/components/DemoBanner";
import { DepositForm } from "@/components/DepositForm";
import { WithdrawForm } from "@/components/WithdrawForm";
import { ExplorerLink } from "@/components/ExplorerLink";
import { RiskCaps } from "@/components/RiskCaps";
import { VaultContracts } from "@/components/VaultContracts";
import { HeroFigure, StatTile } from "@/components/StatTile";
import { erc20Abi, riskManagerAbi, strategyExecutorAbi, vaultAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID } from "@/lib/config";
import { getDemoVault, IS_DEMO } from "@/lib/demo";
import { drawdownBps, formatBps, formatCompact, formatToken, shortenAddress } from "@/lib/format";

export default function VaultPage() {
  const { address: connected } = useAccount();
  const params = useParams<{ address: string }>();
  const vaultAddress = params.address as `0x${string}`;
  const demo = IS_DEMO ? getDemoVault(vaultAddress) : undefined;

  // Explicit, because an already-deployed vault may predate `paused` and
  // `depositCap`: those two reads fail against it, and the rest of the page
  // must still render rather than the whole multicall throwing.
  const { data: core } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: vaultAddress, abi: vaultAbi, functionName: "baseAsset", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "shareToken", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "nav", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "navPerShare", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "highWaterMark", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "performanceFeeBps", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "riskManager", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "strategyExecutor", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "feeRecipient", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "paused", chainId: ACTIVE_CHAIN_ID },
      { address: vaultAddress, abi: vaultAbi, functionName: "depositCap", chainId: ACTIVE_CHAIN_ID },
    ],
    query: { enabled: !IS_DEMO },
  });

  const [
    baseAssetAddress,
    shareTokenAddress,
    onChainNav,
    onChainNavPerShare,
    onChainHwm,
    onChainFeeBps,
    riskManagerAddress,
    strategyExecutorAddress,
    feeRecipient,
    isPaused,
    depositCap,
  ] = (core?.map((d) => d.result) ?? []) as [
    `0x${string}` | undefined,
    `0x${string}` | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    bigint | undefined,
    `0x${string}` | undefined,
    `0x${string}` | undefined,
    `0x${string}` | undefined,
    boolean | undefined,
    bigint | undefined,
  ];

  const { data: tokenInfo } = useReadContracts({
    contracts: [
      { address: baseAssetAddress, abi: erc20Abi, functionName: "decimals", chainId: ACTIVE_CHAIN_ID },
      { address: baseAssetAddress, abi: erc20Abi, functionName: "symbol", chainId: ACTIVE_CHAIN_ID },
      { address: shareTokenAddress, abi: erc20Abi, functionName: "symbol", chainId: ACTIVE_CHAIN_ID },
      { address: shareTokenAddress, abi: erc20Abi, functionName: "totalSupply", chainId: ACTIVE_CHAIN_ID },
    ],
    query: { enabled: !IS_DEMO && Boolean(baseAssetAddress && shareTokenAddress) },
  });

  const [baseDecimals, onChainBaseSymbol, onChainShareSymbol, onChainSupply] =
    (tokenInfo?.map((d) => d.result) ?? []) as [
      number | undefined,
      string | undefined,
      string | undefined,
      bigint | undefined,
    ];

  const { data: onChainTrader } = useReadContract({
    address: strategyExecutorAddress,
    abi: strategyExecutorAbi,
    functionName: "trader",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !IS_DEMO && Boolean(strategyExecutorAddress) },
  });

  const { data: onChainCaps } = useReadContract({
    address: riskManagerAddress,
    abi: riskManagerAbi,
    functionName: "caps",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !IS_DEMO && Boolean(riskManagerAddress) },
  });

  // One shape for both paths, so the view below doesn't branch on demo mode.
  const nav = demo ? demo.nav : onChainNav;
  const navPerShare = demo ? demo.navPerShare : onChainNavPerShare;
  const highWaterMark = demo ? demo.highWaterMark : onChainHwm;
  const sharesOutstanding = demo ? demo.sharesOutstanding : onChainSupply;
  const feeBps = demo
    ? demo.performanceFeeBps
    : onChainFeeBps !== undefined
      ? Number(onChainFeeBps)
      : undefined;
  const trader = demo ? demo.trader : onChainTrader;
  const baseSymbol = demo ? demo.baseSymbol : onChainBaseSymbol;
  const shareSymbol = demo ? demo.shareSymbol : onChainShareSymbol;
  const caps = demo
    ? demo.caps
    : onChainCaps
      ? {
          maxPositionSize: onChainCaps[0],
          maxSingleAssetBps: Number(onChainCaps[1]),
          maxDrawdownBps: Number(onChainCaps[2]),
        }
      : undefined;

  const dd =
    navPerShare !== undefined && highWaterMark !== undefined
      ? drawdownBps(navPerShare, highWaterMark)
      : 0;

  if (IS_DEMO && !demo) {
    return (
      <>
        <DemoBanner />
        <p className="mt-8 text-sm text-ink-secondary">
          No sample vault at this address.{" "}
          <Link href="/strategies" className="text-accent hover:underline">
            Back to strategies
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div>
        {IS_DEMO && <DemoBanner />}

        <Link
          href="/strategies"
          className={`inline-block text-sm text-ink-muted hover:text-ink ${IS_DEMO ? "mt-8" : ""}`}
        >
          ← All strategies
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {demo?.name ?? (shareSymbol ? `${shareSymbol} vault` : "Vault")}
          </h1>
          {demo && <SampleTag />}
          <code className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-ink-muted">
            {demo ? (
              shortenAddress(vaultAddress)
            ) : (
              <ExplorerLink kind="address" value={vaultAddress} />
            )}
          </code>
        </div>
        {demo && <p className="mt-1 text-sm text-ink-muted">{demo.strategy}</p>}

        {!IS_DEMO &&
          connected &&
          trader &&
          connected.toLowerCase() === (trader as string).toLowerCase() && (
            <Link
              href={`/vault/${vaultAddress}/trade`}
              className="mt-4 inline-block rounded-lg border border-border-strong px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Open trader console
            </Link>
          )}

        {isPaused && (
          <div className="mt-4 flex flex-wrap items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <p className="max-w-prose text-sm text-ink-secondary">
              <span className="font-medium text-ink">Paused.</span> The owner has halted deposits
              and strategy trading on this vault.{" "}
              <span className="font-medium text-ink">Withdrawals are unaffected</span> — a pause
              never traps funds already deposited.
            </p>
          </div>
        )}

        <section className="mt-8">
          <HeroFigure
            label="Net asset value"
            value={formatCompact(nav, baseDecimals ?? 18)}
            unit={baseSymbol}
            sub={`${formatCompact(sharesOutstanding)} ${shareSymbol ?? "shares"} outstanding`}
          />
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="NAV / share" value={formatToken(navPerShare, 18, 4)} />
          <StatTile label="High-water mark" value={formatToken(highWaterMark, 18, 4)} />
          <StatTile
            label="Below peak"
            value={dd > 0 ? `−${(dd / 100).toFixed(2)}%` : "At peak"}
            sub={dd > 0 ? "no fee until recovered" : "fee accrues on new profit"}
            tone={dd > 0 ? "warning" : "good"}
          />
          <StatTile label="Performance fee" value={formatBps(feeBps)} sub="above high-water mark" />
        </section>

        <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
          <RiskCaps
            maxPositionSize={caps?.maxPositionSize}
            maxSingleAssetBps={caps?.maxSingleAssetBps}
            maxDrawdownBps={caps?.maxDrawdownBps}
            baseSymbol={baseSymbol}
            baseDecimals={baseDecimals ?? 18}
          />

          <div className="grid gap-4">
            {IS_DEMO ? (
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
                <h2 className="font-medium text-ink">Deposit &amp; withdraw</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Disabled in preview — this is sample data, not a deployed vault. Once a
                  <code className="mx-1 font-mono text-xs">VaultFactory</code>
                  is live, depositors mint shares pro-rata to NAV here and burn them
                  to withdraw.
                </p>
              </div>
            ) : baseAssetAddress && shareTokenAddress && baseDecimals !== undefined ? (
              <>
                <DepositForm
                  vaultAddress={vaultAddress}
                  baseAssetAddress={baseAssetAddress}
                  baseAssetDecimals={baseDecimals}
                  baseAssetSymbol={baseSymbol ?? ""}
                  isPaused={Boolean(isPaused)}
                  depositCap={depositCap}
                  nav={nav}
                />
                <WithdrawForm
                  vaultAddress={vaultAddress}
                  shareTokenAddress={shareTokenAddress}
                  shareSymbol={shareSymbol ?? ""}
                />
              </>
            ) : (
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 text-sm text-ink-muted">
                Loading vault…
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <VaultContracts
            vaultAddress={vaultAddress}
            shareTokenAddress={shareTokenAddress}
            baseAssetAddress={baseAssetAddress}
            riskManagerAddress={riskManagerAddress}
            strategyExecutorAddress={strategyExecutorAddress}
            trader={trader}
            feeRecipient={feeRecipient}
            feeBps={feeBps}
            shareSymbol={shareSymbol}
            isDemo={Boolean(demo)}
          />
        </div>
      </div>
    </>
  );
}
