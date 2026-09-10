"use client";

import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoVaultCard, VaultCard } from "@/components/VaultCard";
import { useCanDeploy } from "@/hooks/useCanDeploy";
import { useVaultAddresses } from "@/hooks/useVaults";
import { VAULT_FACTORY_ADDRESS } from "@/lib/config";
import { DEMO_VAULTS, IS_DEMO } from "@/lib/demo";

export default function Strategies() {
  const { addresses } = useVaultAddresses();
  const { canDeploy } = useCanDeploy();

  return (
    <>
      {IS_DEMO && <DemoBanner />}

      <div
        className={`flex flex-wrap items-start justify-between gap-3 ${IS_DEMO ? "mt-8" : ""}`}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Strategies</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Each strategy is an isolated vault with its own trader, share token and risk caps.
          </p>
        </div>
        {canDeploy && (
          <Link
            href="/strategies/new"
            className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-on transition-opacity hover:opacity-90"
          >
            New strategy
          </Link>
        )}
      </div>

      {IS_DEMO ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {DEMO_VAULTS.map((vault) => (
            <DemoVaultCard key={vault.address} vault={vault} />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface-1 p-6 text-sm text-ink-secondary">
          {VAULT_FACTORY_ADDRESS
            ? "The configured factory has not deployed any vaults yet."
            : "No vault factory configured."}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <VaultCard key={address} vaultAddress={address} />
          ))}
        </div>
      )}
    </>
  );
}
