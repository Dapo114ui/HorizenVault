"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { DemoBanner } from "@/components/DemoBanner";
import { StatCard } from "@/components/StatCard";
import { usePortfolio } from "@/hooks/useVaults";
import { DEMO_POSITION, DEMO_TOTAL_NAV, DEMO_VAULTS, IS_DEMO } from "@/lib/demo";
import {
  formatSignedPercent,
  formatToken,
  returnSinceInception,
  splitAmount,
} from "@/lib/format";

export default function Overview() {
  const { isConnected } = useAccount();
  const { totalNav, positionValue, totalShares, addresses } = usePortfolio();

  const demoVault = DEMO_VAULTS[DEMO_POSITION.vaultIndex];
  const demoPositionValue = (DEMO_POSITION.shares * demoVault.navPerShare) / 10n ** 18n;

  const shownNav = IS_DEMO ? DEMO_TOTAL_NAV : totalNav;
  const shownPosition = IS_DEMO ? demoPositionValue : positionValue;
  const shownShares = IS_DEMO ? DEMO_POSITION.shares : totalShares;
  const vaultCount = IS_DEMO ? DEMO_VAULTS.length : addresses.length;

  const shareOfTvl =
    shownNav > 0n ? (Number(shownPosition) / Number(shownNav)) * 100 : undefined;
  const vaultReturn = returnSinceInception(IS_DEMO ? demoVault.navPerShare : undefined);

  const showPosition = IS_DEMO || isConnected;
  const { whole, fraction } = splitAmount(showPosition ? shownPosition : shownNav);

  return (
    <>
      {IS_DEMO && <DemoBanner />}

      <div className={IS_DEMO ? "mt-8" : ""}>
        <p className="text-sm text-ink-secondary">
          {showPosition ? "Your position" : "Total value locked"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
          Horizen Vault
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Pro-rata shares in strategy vaults, with risk caps enforced on-chain.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="self-start rounded-xl border border-border-subtle bg-surface-1 p-5">
          <p className="text-sm text-ink-secondary">
            {showPosition ? "Your vault balance" : "Total value locked"}
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-ink">
            {whole}
            <span className="text-ink-muted">{fraction}</span>
            <span className="ml-2 text-lg font-medium text-ink-secondary">
              {IS_DEMO ? demoVault.baseSymbol : ""}
            </span>
          </p>

          {!showPosition && (
            <p className="mt-3 text-sm text-ink-muted">
              Connect a wallet to see your own position.
            </p>
          )}

          {showPosition && (
            <p className="mt-2 text-sm text-ink-muted">
              {formatToken(shownShares, 18, 2)} shares held
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/strategies"
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-on transition-opacity hover:opacity-90"
            >
              Deposit assets
            </Link>
            <Link
              href="/strategies"
              className="rounded-lg border border-border-strong px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Withdraw
            </Link>
          </div>
        </section>

        <div className="grid gap-3">
          <StatCard
            tone="accent"
            label="Return since inception"
            hint={IS_DEMO ? demoVault.name : "per share"}
            value={IS_DEMO ? formatSignedPercent(vaultReturn) : "—"}
            icon="trend"
          />
          <StatCard
            label="Your share of TVL"
            hint="of vault assets"
            value={
              showPosition && shareOfTvl !== undefined ? `${shareOfTvl.toFixed(3)}%` : "—"
            }
            icon="wallet"
          />
          <StatCard
            label="Strategies"
            hint="isolated vaults"
            value={String(vaultCount)}
            icon="shield"
          />
        </div>
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <Claim title="Risk caps on-chain" body="Position, exposure and drawdown limits revert the trade on breach." />
        <Claim title="Vault-held custody" body="The strategy trades vault funds; it can never withdraw them." />
        <Claim
          title="High-water-mark fees"
          body="Performance fees accrue only above the vault's previous peak."
        />
      </section>

      <p className="mt-6 text-xs text-ink-muted">
        Not audited. No third-party security review has been carried out yet — see the{" "}
        <a
          href="https://github.com/Dapo114ui/Vault/blob/main/docs/NEXT_STEPS.md"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-ink-secondary"
        >
          project notes
        </a>
        .
      </p>
    </>
  );
}

function Claim({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{body}</p>
    </div>
  );
}
