"use client";

import { ExplorerLink } from "./ExplorerLink";
import { formatBps, shortenAddress } from "@/lib/format";

type Row = { label: string; address?: `0x${string}` };

/** Links to the explorer on a real chain; plain text in preview mode. */
function Address({ value, isDemo }: { value?: `0x${string}`; isDemo: boolean }) {
  if (!value) return <>—</>;
  if (isDemo) return <>{shortenAddress(value)}</>;
  return <ExplorerLink kind="address" value={value} />;
}

/**
 * Who operates a vault, what they can do with your money, and who is paid
 * for it.
 *
 * The trader leads because it is the fact a depositor most needs and is
 * least able to infer: the vault's whole proposition is that this address
 * can trade the funds but cannot take them, which is worth stating next to
 * the address rather than leaving as marketing copy elsewhere.
 */
export function VaultContracts({
  vaultAddress,
  shareTokenAddress,
  baseAssetAddress,
  riskManagerAddress,
  strategyExecutorAddress,
  trader,
  feeRecipient,
  feeBps,
  shareSymbol,
  isDemo = false,
}: {
  vaultAddress: `0x${string}`;
  shareTokenAddress?: `0x${string}`;
  baseAssetAddress?: `0x${string}`;
  riskManagerAddress?: `0x${string}`;
  strategyExecutorAddress?: `0x${string}`;
  trader?: `0x${string}`;
  feeRecipient?: `0x${string}`;
  feeBps?: number;
  shareSymbol?: string;
  isDemo?: boolean;
}) {
  const rows: Row[] = [
    { label: "Vault", address: vaultAddress },
    { label: "Share token", address: shareTokenAddress },
    { label: "Base asset", address: baseAssetAddress },
    { label: "Risk manager", address: riskManagerAddress },
    { label: "Strategy executor", address: strategyExecutorAddress },
  ];

  const traderIsFeeRecipient =
    trader && feeRecipient && trader.toLowerCase() === feeRecipient.toLowerCase();

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h2 className="font-medium text-ink">Who runs this vault</h2>

      <div className="mt-3 rounded-lg bg-surface-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm text-ink-secondary">Trader</span>
          <span className="tabular font-mono text-sm text-ink">
            <Address value={trader} isDemo={isDemo} />
          </span>
        </div>

        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink-secondary">Can</dt>
            <dd className="mt-0.5 text-ink-muted">
              Route swaps using the vault&rsquo;s funds, within the risk caps.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink-secondary">Cannot</dt>
            <dd className="mt-0.5 text-ink-muted">
              Withdraw to their own address, change the risk caps, or replace themselves.
            </dd>
          </div>
        </dl>
      </div>

      {traderIsFeeRecipient && (
        <p className="mt-3 text-xs text-ink-muted">
          The trader is also the fee recipient on this vault.
        </p>
      )}

      <h3 className="mt-5 text-xs uppercase tracking-widest text-ink-muted">Contracts</h3>
      <dl className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
        {rows.map(({ label, address }) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="tabular font-mono text-xs text-ink-secondary">
              <Address value={address} isDemo={isDemo} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-ink-muted">Performance fee paid to</span>
          <span className="tabular font-mono text-xs text-ink-secondary">
            <Address value={feeRecipient} isDemo={isDemo} />
          </span>
        </div>
        <p className="mt-2 max-w-prose text-xs text-ink-muted">
          {formatBps(feeBps)} of profit above the high-water mark is charged as newly minted{" "}
          {shareSymbol ?? "share"} tokens paid to that address. Minting new shares dilutes every
          existing holder proportionally, so the charge will not appear as a deduction from your
          balance — your share of the vault gets slightly smaller instead.
        </p>
      </div>
    </div>
  );
}
