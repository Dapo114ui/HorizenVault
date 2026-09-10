/**
 * Shown on every view whenever demo data is on screen. Deliberately
 * unmissable: sample figures must never be mistakable for real on-chain
 * activity.
 */
export function DemoBanner() {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
      <p className="text-sm font-medium text-ink">
        Preview with sample data — these are not real vaults
      </p>
      <p className="mt-1 text-sm text-ink-secondary">
        No <code className="font-mono text-xs">VaultFactory</code> is deployed to Horizen yet,
        so this page shows illustrative figures to demonstrate the interface. Deposits and
        withdrawals are disabled. Set{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_VAULT_FACTORY_ADDRESS</code> to point it at
        a real deployment.
      </p>
    </div>
  );
}

export function SampleTag() {
  return (
    <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-secondary">
      Sample
    </span>
  );
}
