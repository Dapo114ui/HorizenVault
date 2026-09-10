import { formatUnits, parseUnits } from "viem";

export function formatToken(value: bigint | undefined, decimals = 18, fractionDigits = 4): string {
  if (value === undefined) return "—";
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, fractionDigits).replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

/** Auto-compacted for display: 1,284 / 12.9K / 4.2M. */
export function formatCompact(value: bigint | undefined, decimals = 18): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatBps(bps: number | undefined): string {
  if (bps === undefined) return "—";
  return `${bps / 100}%`;
}

export function parseToken(value: string, decimals = 18): bigint {
  return parseUnits(value || "0", decimals);
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * NAV per share against the vault's high-water mark. Below the mark, the
 * strategy earns no performance fee until it recovers -- worth surfacing,
 * since it's the number that decides whether a depositor is paying one.
 */
/** Splits a value for display so the decimals can be de-emphasised. */
export function splitAmount(
  value: bigint | undefined,
  decimals = 18
): { whole: string; fraction: string } {
  if (value === undefined) return { whole: "—", fraction: "" };
  const n = Number(formatUnits(value, decimals));
  if (!Number.isFinite(n)) return { whole: "—", fraction: "" };
  const whole = Math.trunc(n).toLocaleString();
  const fraction = Math.abs(n % 1)
    .toFixed(2)
    .slice(1); // ".42"
  return { whole, fraction };
}

/**
 * The vault's return per share since launch: NAV/share started at exactly
 * 1.0, so this is a realised, on-chain figure -- not a projected APY, which
 * the contracts neither compute nor promise.
 */
export function returnSinceInception(navPerShare: bigint | undefined): number | undefined {
  if (navPerShare === undefined) return undefined;
  return (Number(navPerShare) / 1e18 - 1) * 100;
}

export function formatSignedPercent(pct: number | undefined, digits = 2): string {
  if (pct === undefined) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

export function drawdownBps(navPerShare: bigint, highWaterMark: bigint): number {
  if (highWaterMark === 0n || navPerShare >= highWaterMark) return 0;
  return Number(((highWaterMark - navPerShare) * 10_000n) / highWaterMark);
}
