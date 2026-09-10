"use client";

import { useWrongNetwork } from "@/hooks/useNetwork";
import { useVaultAddresses } from "@/hooks/useVaults";
import { ACTIVE_CHAIN } from "@/lib/config";
import { DEMO_VAULTS, IS_DEMO } from "@/lib/demo";

/**
 * Navigation shared by the desktop sidebar and the mobile menu. Kept in one
 * place so the two can't drift -- the mobile menu exists because below the
 * sidebar's breakpoint there was previously no way to reach Activity at all.
 */

export const DOCS_URL = "https://github.com/Dapo114ui/HorizenVault/tree/main/docs";

const iconClass = "h-4 w-4 shrink-0 text-ink-muted";

export function GridIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 13V7M8 13V3M13 13v-4" strokeLinecap="round" />
    </svg>
  );
}

export function FeedIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h6" strokeLinecap="round" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 3h4a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5H3V3Z" />
      <path d="M13 3H9a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5H13V3Z" />
    </svg>
  );
}

export function SealIcon() {
  return (
    <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="3" />
      <path d="M8 6v3" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M6 3h7v7M13 3 6.5 9.5" strokeLinecap="round" />
      <path d="M11 10v3H3V5h3" strokeLinecap="round" />
    </svg>
  );
}

export const NAV = [
  { href: "/", label: "Overview", icon: GridIcon },
  { href: "/strategies", label: "Strategies", icon: ChartIcon },
  { href: "/sealed", label: "Sealed", icon: SealIcon },
  { href: "/activity", label: "Activity", icon: FeedIcon },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Network label and vault count, identical in both navigations. */
export function useNavMeta() {
  const { isWrongNetwork } = useWrongNetwork();
  const { addresses } = useVaultAddresses();

  // Name the network the app actually reads from, not the wallet's -- those
  // can differ, and the wallet's is the one that's wrong when they do.
  const networkLabel = IS_DEMO
    ? "Preview — no network"
    : isWrongNetwork
      ? `${ACTIVE_CHAIN.name} — wallet elsewhere`
      : ACTIVE_CHAIN.name;

  return {
    networkLabel,
    isWrongNetwork,
    needsAttention: IS_DEMO || isWrongNetwork,
    vaultCount: IS_DEMO ? DEMO_VAULTS.length : addresses.length,
  };
}

export function NetworkChip({ className = "" }: { className?: string }) {
  const { networkLabel, needsAttention } = useNavMeta();
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 ${className}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${needsAttention ? "bg-warning" : "bg-good"}`}
      />
      <span className="truncate text-xs text-ink-secondary">{networkLabel}</span>
    </div>
  );
}
