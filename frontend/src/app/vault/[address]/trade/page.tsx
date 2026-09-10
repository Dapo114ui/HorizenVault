"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReadContract, useSimulateContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { DemoBanner } from "@/components/DemoBanner";
import { useTradeContext, type Token } from "@/hooks/useTradeContext";
import { useWrongNetwork } from "@/hooks/useNetwork";
import { routerAbi, strategyExecutorAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID, wagmiConfig } from "@/lib/config";
import { IS_DEMO } from "@/lib/demo";
import { formatToken, parseToken, shortenAddress } from "@/lib/format";

const DEADLINE_MINUTES = 20;

/**
 * The deadline is set when the trade is actually signed. Simulating with a
 * far-future one keeps the check stable across renders while still
 * exercising every risk check -- the deadline is the router's own guard, not
 * one of them.
 */
const SIMULATION_DEADLINE = BigInt("0xffffffffff");

function deadlineFromNow(minutes: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}

export default function TradePage() {
  const params = useParams<{ address: string }>();
  const vaultAddress = params.address as `0x${string}`;
  const ctx = useTradeContext(vaultAddress);
  const { isWrongNetwork } = useWrongNetwork();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [tokenInAddr, setTokenInAddr] = useState<string>("");
  const [tokenOutAddr, setTokenOutAddr] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [slippagePct, setSlippagePct] = useState("1");
  const [status, setStatus] = useState<"idle" | "trading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Default the pair once tokens load: base in, first tracked asset out.
  const tokenIn =
    ctx.tokens.find((t) => t.address === tokenInAddr) ?? ctx.tokens.find((t) => t.isBase);
  const tokenOut =
    ctx.tokens.find((t) => t.address === tokenOutAddr) ??
    ctx.tokens.find((t) => !t.isBase && t.address !== tokenIn?.address);

  const amountIn = tokenIn && amount ? parseToken(amount, tokenIn.decimals) : 0n;
  const path = tokenIn && tokenOut ? [tokenIn.address, tokenOut.address] : undefined;
  const pairValid = Boolean(tokenIn && tokenOut && tokenIn.address !== tokenOut.address);

  // Quote from the router. Its ABI is assumed Uniswap-V2-shaped and has not
  // been verified against a real venue, so a failure here is expected-and-handled
  // rather than an error: the trader sets the floor by hand instead.
  const {
    data: quote,
    isError: quoteFailed,
    isFetching: quoting,
  } = useReadContract({
    address: ctx.router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: path && amountIn > 0n ? [amountIn, path] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(ctx.router && ctx.canTrade && path && amountIn > 0n), retry: false },
  });

  const quotedOut = quote ? (quote as readonly bigint[])[1] : undefined;
  const quoteIsEmpty = quotedOut !== undefined && quotedOut === 0n;
  const expectedOut = quoteIsEmpty ? undefined : quotedOut;
  const slippageBps = BigInt(Math.round(Number(slippagePct || "0") * 100));
  const [manualMin, setManualMin] = useState("");

  const amountOutMin =
    expectedOut !== undefined
      ? (expectedOut * (10_000n - slippageBps)) / 10_000n
      : tokenOut && manualMin
        ? parseToken(manualMin, tokenOut.decimals)
        : 0n;

  const overBalance = Boolean(tokenIn && amountIn > tokenIn.balance);
  const overPositionCap = Boolean(ctx.caps && amountIn > ctx.caps.maxPositionSize);

  const localProblems: string[] = [];
  if (!pairValid) localProblems.push("Choose two different tokens.");
  if (amountIn <= 0n) localProblems.push("Enter an amount above zero.");
  if (overBalance && tokenIn)
    localProblems.push(
      `The vault holds only ${formatToken(tokenIn.balance, tokenIn.decimals)} ${tokenIn.symbol}.`
    );
  if (overPositionCap && ctx.caps && ctx.baseDecimals !== undefined)
    localProblems.push(
      `Above the max position size of ${formatToken(ctx.caps.maxPositionSize, ctx.baseDecimals)}.`
    );
  if (expectedOut === undefined && amountIn > 0n && !quoting && amountOutMin <= 0n)
    localProblems.push("Set a minimum received, since the router did not return a quote.");

  const readyToSimulate =
    ctx.isTrader && ctx.canTrade && localProblems.length === 0 && Boolean(path) && !isWrongNetwork;

  // The contract is the authority on whether a trade is allowed, so ask it
  // rather than reimplementing the risk checks here and risking disagreement.
  const {
    data: simulation,
    error: simulationError,
    isFetching: simulating,
  } = useSimulateContract({
    address: ctx.executor,
    abi: strategyExecutorAbi,
    functionName: "executeSwap",
    args: path ? [path, amountIn, amountOutMin, SIMULATION_DEADLINE] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    account: ctx.connected,
    query: { enabled: readyToSimulate && Boolean(ctx.executor), retry: false },
  });

  const wouldRevert = Boolean(simulationError);
  const canSubmit = readyToSimulate && Boolean(simulation) && !wouldRevert && status !== "trading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !path || !ctx.executor) return;
    setError(null);
    setTxHash(null);
    setStatus("trading");
    try {
      const hash = await writeContractAsync({
        address: ctx.executor,
        abi: strategyExecutorAbi,
        functionName: "executeSwap",
        chainId: ACTIVE_CHAIN_ID,
        args: [path, amountIn, amountOutMin, deadlineFromNow(DEADLINE_MINUTES)],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      await queryClient.invalidateQueries();
      setTxHash(hash);
      setAmount("");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Trade failed");
    }
  }

  if (IS_DEMO) {
    return (
      <>
        <DemoBanner />
        <div className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Trade</h1>
          <p className="mt-3 max-w-prose text-sm text-ink-secondary">
            Disabled in preview. On a live vault, its designated trader routes swaps here — the
            vault moves its own tokens and runs the risk checks; the trader never takes custody.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Link
        href={`/vault/${vaultAddress}`}
        className="inline-block text-sm text-ink-muted hover:text-ink"
      >
        ← Back to vault
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Trade</h1>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        Routes a swap of the vault&rsquo;s own funds through the venue. The vault holds the tokens
        throughout; the risk caps are checked around the trade and revert it on breach.
      </p>

      {!ctx.canTrade && (
        <Notice title="This vault cannot trade">
          It was deployed with no router, so it only ever holds its base asset. Deposits and
          withdrawals work; swaps are impossible by construction.
        </Notice>
      )}

      {ctx.canTrade && !ctx.hasTrackedAssets && (
        <Notice title="No tracked assets">
          The vault can only swap into assets its owner has tracked, so that NAV can price them.
          Nothing is tracked yet.
        </Notice>
      )}

      {ctx.canTrade && !ctx.isTrader && (
        <Notice title={ctx.isConnected ? "This wallet is not the trader" : "Connect the trader wallet"}>
          Only the vault&rsquo;s designated trader can route swaps
          {ctx.trader && (
            <>
              {" "}
              — that is <code className="font-mono text-xs">{shortenAddress(ctx.trader)}</code>
            </>
          )}
          .
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <fieldset
          disabled={!ctx.isTrader || !ctx.canTrade}
          className="rounded-xl border border-border-subtle bg-surface-1 p-5 disabled:opacity-60"
        >
          <legend className="px-1 text-sm font-medium text-ink">Swap</legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <TokenPicker
              label="From"
              tokens={ctx.tokens}
              value={tokenIn?.address ?? ""}
              onChange={setTokenInAddr}
              showBalance
            />
            <TokenPicker
              label="To"
              tokens={ctx.tokens.filter((t) => t.address !== tokenIn?.address)}
              value={tokenOut?.address ?? ""}
              onChange={setTokenOutAddr}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-secondary">
                Amount in {tokenIn ? `(${tokenIn.symbol})` : ""}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min="0"
                step="any"
                placeholder="0.0"
                className={inputClass}
              />
              {tokenIn && (
                <button
                  type="button"
                  onClick={() => setAmount(formatToken(tokenIn.balance, tokenIn.decimals, 18))}
                  className="mt-1 text-xs text-accent hover:underline"
                >
                  Vault holds {formatToken(tokenIn.balance, tokenIn.decimals)} {tokenIn.symbol}
                </button>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-ink-secondary">Max slippage (%)</span>
              <input
                value={slippagePct}
                onChange={(e) => setSlippagePct(e.target.value)}
                type="number"
                min="0"
                max="50"
                step="any"
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-ink-muted">
                Sets the minimum received; the swap reverts below it.
              </span>
            </label>
          </div>

          <div className="mt-4 rounded-lg bg-surface-2 p-4 text-sm">
            {quoting ? (
              <span className="text-ink-muted">Quoting…</span>
            ) : expectedOut !== undefined && tokenOut ? (
              <dl className="grid gap-1.5">
                <Row
                  label="Expected out"
                  value={`${formatToken(expectedOut, tokenOut.decimals)} ${tokenOut.symbol}`}
                />
                <Row
                  label="Minimum received"
                  value={`${formatToken(amountOutMin, tokenOut.decimals)} ${tokenOut.symbol}`}
                />
              </dl>
            ) : amountIn > 0n && (quoteFailed || quoteIsEmpty) ? (
              <div>
                <p className="text-ink-secondary">
                  {quoteIsEmpty
                    ? "The router quoted zero out for this pair — it has no route or no liquidity between these tokens. A swap would return nothing."
                    : "The router did not answer a quote. Its ABI is assumed Uniswap-V2-shaped and has not been verified against a deployed venue, so set the floor yourself."}
                </p>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-ink-secondary">
                    Minimum received {tokenOut ? `(${tokenOut.symbol})` : ""}
                  </span>
                  <input
                    value={manualMin}
                    onChange={(e) => setManualMin(e.target.value)}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.0"
                    className={inputClass}
                  />
                </label>
              </div>
            ) : (
              <span className="text-ink-muted">Enter an amount to see a quote.</span>
            )}
          </div>
        </fieldset>

        {localProblems.length > 0 && ctx.isTrader && ctx.canTrade && (
          <ul className="grid gap-1 rounded-xl border border-border-subtle bg-surface-1 p-4 text-xs text-ink-muted">
            {localProblems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}

        {readyToSimulate && (
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  simulating ? "bg-ink-muted" : wouldRevert ? "bg-critical" : "bg-good"
                }`}
              />
              <span className="text-sm font-medium text-ink">
                {simulating
                  ? "Checking against the contract…"
                  : wouldRevert
                    ? "This trade would be rejected"
                    : "Passes every on-chain check"}
              </span>
            </div>
            <p className="mt-1.5 max-w-prose text-xs text-ink-muted">
              {wouldRevert
                ? revertReason(simulationError)
                : "Simulated against the deployed contracts, including the risk caps. No gas spent."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-on transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {status === "trading"
              ? "Trading…"
              : isWrongNetwork
                ? "Wrong network"
                : "Execute swap"}
          </button>
          <span className="text-xs text-ink-muted">
            Expires {DEADLINE_MINUTES} minutes after signing.
          </span>
        </div>

        {txHash && (
          <p className="text-xs text-good">
            Swap executed. <span className="font-mono">{shortenAddress(txHash)}</span>
          </p>
        )}
        {error && <p className="max-w-prose text-xs text-critical">{error}</p>}
      </form>
    </>
  );
}

/** Pull the useful line out of a viem simulation error. */
function revertReason(err: unknown): string {
  if (!(err instanceof Error)) return "The contract rejected this trade.";
  const named = err.message.match(
    /(PositionTooLarge|AssetExposureTooHigh|DrawdownExceeded|AssetNotTracked|InvalidPath|StalePrice|InvalidPrice|OnlyTrader|OnlyStrategyExecutor)[^\n]*/
  );
  // Viem wraps the signature in quotes; trim the stray tail off the match.
  if (named) return `Reverted with ${named[0].trim().replace(/["'.,\s]+$/, "")}`;
  const short = err.message.match(/reverted with[^\n]*/i) ?? err.message.match(/^[^\n]+/);
  return short ? short[0].trim() : "The contract rejected this trade.";
}

const inputClass =
  "w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

function TokenPicker({
  label,
  tokens,
  value,
  onChange,
  showBalance,
}: {
  label: string;
  tokens: Token[];
  value: string;
  onChange: (v: string) => void;
  showBalance?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} appearance-none`}
      >
        {tokens.length === 0 && <option value="">No tokens</option>}
        {tokens.map((t) => (
          <option key={t.address} value={t.address}>
            {t.symbol}
            {t.isBase ? " (base)" : ""}
            {showBalance ? ` — ${formatToken(t.balance, t.decimals)}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="tabular font-mono text-xs text-ink">{value}</dd>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">{children}</p>
    </div>
  );
}
