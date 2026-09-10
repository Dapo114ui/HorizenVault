import { SealedPanel } from "@/components/SealedPanel";
import { HeroFigure } from "@/components/StatTile";
import {
  IS_SEALED_PREVIEW,
  PREVIEW_PROOF_HISTORY,
  PREVIEW_SEALED_STATE,
  zkVerifyNote,
} from "@/lib/confidential";
import { formatCompact } from "@/lib/format";

export const metadata = {
  title: "Sealed positions — Horizen Vault",
  description:
    "A vault whose positions nobody can read, and whose risk limits are proven to hold anyway.",
};

/**
 * The confidential layer, made legible.
 *
 * A depositor's first question about a vault they cannot see into is not "how
 * does the cryptography work" — it is "then what exactly am I trusting?" So
 * this page leads with the split between what is published and what is
 * sealed, and only then explains the mechanism underneath it.
 */
export default function SealedPage() {
  const state = PREVIEW_SEALED_STATE;
  const history = PREVIEW_PROOF_HISTORY;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      {IS_SEALED_PREVIEW && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
          <p className="text-sm text-ink">
            <span className="font-medium">Preview.</span> No confidential vault is
            deployed yet, so the figures below are illustrative. The commitment
            shown is a real Poseidon output from the circuit in this repository,
            not a random-looking placeholder.
          </p>
        </div>
      )}

      <header className="max-w-2xl">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
          Confidential execution
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Positions nobody can read.
          <br />
          Limits everyone can check.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
          A public vault leaks its edge: the balances that let a contract enforce
          a risk cap are the same balances that let anyone copy the strategy or
          trade against it. This vault publishes a commitment to its positions
          instead, and moves that commitment only against a zero-knowledge proof
          that the new positions value to the NAV it reports and stay inside
          every cap.
        </p>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <HeroFigure
          label="Attested net asset value"
          value={formatCompact(state.attestedNav)}
          unit={state.baseSymbol}
          sub={`Proven across ${state.sequence} state transitions, without a single position disclosed`}
        />
      </div>

      <div className="mt-8">
        <SealedPanel state={state} />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-ink">Proof history</h2>
        <p className="mt-1 text-xs text-ink-muted">{zkVerifyNote()}</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border-subtle bg-surface-1">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Step</th>
                <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Commitment</th>
                <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">Attested NAV</th>
                <th className="px-4 py-2.5 text-xs font-medium text-ink-muted">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {history.map((step) => (
                <tr key={step.sequence.toString()}>
                  <td className="tabular px-4 py-3 text-ink">#{step.sequence.toString()}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11px] text-ink-secondary">
                      {"0x" + step.commitment.toString(16).slice(0, 12)}…
                    </span>
                  </td>
                  <td className="tabular px-4 py-3 text-ink">
                    {formatCompact(step.nav)} {state.baseSymbol}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{step.at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Each row is a trade the operator made and proved. The step number is
          part of what is proven, so a proof cannot be reused later — including
          after the vault trades back into a position it held before, which is
          the case commitment-chaining alone would miss.
        </p>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "What the proof establishes",
            body: "That the hidden quantities open the published commitment, that they value to the reported NAV at oracle prices, and that no position breaches its cap.",
          },
          {
            title: "What is checked in the open",
            body: "The drawdown limit. It relates NAV to the high-water mark and both are public, so proving it in zero knowledge would cost constraints and reveal nothing.",
          },
          {
            title: "What is not yet proven",
            body: "That each state was reached by a legitimate trade. Today the proof constrains where the vault ends up, not the journey — the next iteration adds conservation across the swap.",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <h3 className="text-sm font-medium text-ink">{card.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
