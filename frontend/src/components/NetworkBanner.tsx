"use client";

import { useWrongNetwork } from "@/hooks/useNetwork";
import { IS_DEMO } from "@/lib/demo";

/**
 * Wallet-on-the-wrong-chain is otherwise invisible: deposits just revert and
 * balances read as zero, with nothing on screen saying why.
 */
export function NetworkBanner() {
  const { isWrongNetwork, expected, switchToActive, isSwitching } = useWrongNetwork();

  if (IS_DEMO || !isWrongNetwork) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning/10 px-6 py-2.5">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
      <p className="flex-1 text-sm text-ink-secondary">
        Your wallet is on a different network. Vault balances are read from{" "}
        <span className="font-medium text-ink">{expected.name}</span>, and deposits need your
        wallet there too.
      </p>
      <button
        onClick={switchToActive}
        disabled={isSwitching}
        className="rounded-lg border border-border-strong bg-surface-1 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
      >
        {isSwitching ? "Switching…" : `Switch to ${expected.name}`}
      </button>
    </div>
  );
}
