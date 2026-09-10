"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import {
  BookIcon,
  DOCS_URL,
  ExternalIcon,
  NAV,
  NetworkChip,
  isActive,
  useNavMeta,
} from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const { vaultCount } = useNavMeta();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-1 lg:flex">
      <div className="px-5 py-5">
        <Link href="/" aria-label="Horizen Vault home" className="inline-block">
          <Wordmark className="h-7 w-auto text-ink" />
        </Link>
      </div>

      <div className="px-4">
        <NetworkChip />
      </div>

      <nav className="mt-6 px-3">
        <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-ink-muted">Workspace</p>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
              isActive(pathname, href)
                ? "bg-surface-2 font-medium text-ink"
                : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {label === "Strategies" && vaultCount > 0 && (
              <span className="rounded bg-surface-1 px-1.5 text-xs text-ink-muted">
                {vaultCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <nav className="mt-6 px-3">
        <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-ink-muted">Protocol</p>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <BookIcon />
          <span className="flex-1">Documentation</span>
          <ExternalIcon />
        </a>
      </nav>
    </aside>
  );
}
