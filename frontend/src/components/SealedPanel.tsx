import { formatBps, formatCompact } from "@/lib/format";
import type { SealedState } from "@/lib/confidential";

/**
 * The two-column split is the whole argument of this protocol, so it gets the
 * page's most prominent surface rather than a footnote.
 *
 * Left: what the chain publishes, and what a depositor can therefore check.
 * Right: what nobody can read, including us.
 *
 * The right column deliberately shows the *shape* of what is hidden -- eight
 * slots, one per asset in the universe -- rather than a vague "private" label.
 * A depositor should be able to see exactly how much is being withheld, which
 * is a different thing from seeing the values.
 */

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-ink">{label}</div>
        {note && <div className="mt-0.5 text-xs text-ink-muted">{note}</div>}
      </div>
      <div className="tabular shrink-0 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

/** A hidden quantity: the slot is real, the value is not knowable. */
function SealedSlot({ asset }: { asset: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
      <span className="text-sm text-ink-secondary">{asset}</span>
      <span
        aria-label="sealed"
        className="flex items-center gap-[3px]"
        title="This quantity is committed to on-chain but never published"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} aria-hidden className="h-1.5 w-1.5 rounded-full bg-border-strong" />
        ))}
      </span>
    </div>
  );
}

export function SealedPanel({ state }: { state: SealedState }) {
  const commitmentHex = "0x" + state.stateCommitment.toString(16);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border-subtle bg-surface-1 p-5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-good" />
          <h2 className="text-sm font-semibold text-ink">Published</h2>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          On-chain and checkable by anyone. This is the track record a depositor
          allocates on.
        </p>

        <div className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
          <Row
            label="Attested NAV"
            value={`${formatCompact(state.attestedNav)} ${state.baseSymbol}`}
            note="Proven to equal the hidden positions at oracle prices"
          />
          <Row
            label="High-water mark"
            value={`${formatCompact(state.highWaterMark)} ${state.baseSymbol}`}
            note="Performance fees accrue only above this"
          />
          <Row
            label="Transitions proven"
            value={state.sequence.toString()}
            note="Each one carried a proof that the caps held"
          />
          <Row
            label="Max position size"
            value={`${formatCompact(state.caps.maxPositionSize)} ${state.baseSymbol}`}
          />
          <Row label="Max single-asset exposure" value={formatBps(state.caps.maxSingleAssetBps)} />
          <Row label="Max drawdown" value={formatBps(state.caps.maxDrawdownBps)} />
        </div>

        <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5">
          <div className="text-xs text-ink-muted">State commitment</div>
          <div className="tabular mt-1 break-all font-mono text-[11px] leading-relaxed text-ink-secondary">
            {commitmentHex}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-1 p-5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          <h2 className="text-sm font-semibold text-ink">Sealed</h2>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          Committed to on-chain, readable by no one — not the operator&rsquo;s
          competitors, not the protocol, not us.
        </p>

        <div className="mt-3 grid gap-1.5">
          {state.universe.map((asset) => (
            <SealedSlot key={asset} asset={asset} />
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          <span className="text-ink-secondary">What this does and does not hide.</span>{" "}
          The eight assets above are the universe this vault is permitted to
          trade, and that list is public. The quantities are not — including the
          zeroes, so which assets it is actually in stays private too. Hiding
          the universe itself would need a different commitment scheme.
        </p>
      </section>
    </div>
  );
}
