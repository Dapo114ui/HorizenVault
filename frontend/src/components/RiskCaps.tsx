import { formatBps, formatCompact } from "@/lib/format";

/**
 * The caps RiskManager enforces around every trade. A breach reverts the
 * trade, so these are hard limits rather than targets -- which is the point
 * worth making to a depositor.
 */
export function RiskCaps({
  maxPositionSize,
  maxSingleAssetBps,
  maxDrawdownBps,
  baseSymbol,
  baseDecimals = 18,
}: {
  maxPositionSize?: bigint;
  maxSingleAssetBps?: number;
  maxDrawdownBps?: number;
  baseSymbol?: string;
  /** Caps are denominated in the base asset's own units, like NAV. */
  baseDecimals?: number;
}) {
  const rows = [
    {
      label: "Max position size",
      value:
        maxPositionSize !== undefined
          ? `${formatCompact(maxPositionSize, baseDecimals)} ${baseSymbol ?? ""}`
          : "—",
      note: "per single trade",
    },
    {
      label: "Max single-asset exposure",
      value: formatBps(maxSingleAssetBps),
      note: "share of NAV in any one non-base asset",
    },
    {
      label: "Max drawdown",
      value: formatBps(maxDrawdownBps),
      note: "from high-water-mark NAV/share",
    },
  ];

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-ink">Risk caps</h2>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
          Enforced on-chain
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Checked before and after every strategy trade. A breach reverts the trade.
      </p>
      <dl className="mt-4 divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <div>
              <dt className="text-sm text-ink">{row.label}</dt>
              <dd className="text-xs text-ink-muted">{row.note}</dd>
            </div>
            <span className="tabular shrink-0 text-sm font-medium text-ink">{row.value}</span>
          </div>
        ))}
      </dl>
    </section>
  );
}
