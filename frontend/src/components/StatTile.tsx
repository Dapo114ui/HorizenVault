const DOT: Record<string, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
};

/**
 * Status is carried by a dot beside the label plus the value's own wording,
 * never by coloring the value text -- the warning step doesn't clear contrast
 * on the light surface, and state should never be color-alone anyway.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "critical";
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        {tone !== "default" && (
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
        )}
        <span className="text-xs text-ink-muted">{label}</span>
      </div>
      <div className="mt-1.5 text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

/** The single number a view leads with. Exactly one per page. */
export function HeroFigure({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-sm text-ink-secondary">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-xl font-medium text-ink-secondary">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-sm text-ink-muted">{sub}</div>}
    </div>
  );
}
