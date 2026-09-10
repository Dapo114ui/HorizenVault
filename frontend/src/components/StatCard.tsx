const ICONS = {
  trend: (
    <path d="M3 11.5 6.5 8l2.5 2.5L13 5.5M13 5.5H10M13 5.5v3" strokeLinecap="round" strokeLinejoin="round" />
  ),
  wallet: (
    <>
      <rect x="2.5" y="4" width="11" height="8.5" rx="1.5" />
      <path d="M10.5 8.25h1.5" strokeLinecap="round" />
    </>
  ),
  shield: (
    <path d="M8 2.5 13 4.5v3.2c0 2.7-2 5-5 5.8-3-.8-5-3.1-5-5.8V4.5L8 2.5Z" strokeLinejoin="round" />
  ),
};

/** Stat card with an icon tile. State rides on the label, never the value colour. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: keyof typeof ICONS;
  tone?: "default" | "accent";
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3.5">
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-secondary"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          {ICONS[icon]}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs text-ink-muted">{label}</span>
          {hint && <span className="shrink-0 truncate text-xs text-ink-muted">{hint}</span>}
        </div>
        <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
