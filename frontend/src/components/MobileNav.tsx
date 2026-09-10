"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookIcon,
  DOCS_URL,
  ExternalIcon,
  NAV,
  NetworkChip,
  isActive,
  useNavMeta,
} from "./nav";

/**
 * The sidebar is desktop-only, so without this there is no way to reach
 * Activity on a phone at all.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { vaultCount, needsAttention } = useNavMeta();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="relative flex items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-1.5 text-sm text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          {open ? (
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          ) : (
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" strokeLinecap="round" />
          )}
        </svg>
        <span>Menu</span>
        {needsAttention && !open && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning"
          />
        )}
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-ink/20"
          />
          <div
            id="mobile-nav-panel"
            className="absolute left-0 right-0 top-full z-50 border-b border-border-subtle bg-surface-1 px-4 py-4 shadow-lg"
          >
            <NetworkChip className="mb-3" />

            <nav className="grid gap-0.5">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors ${
                    isActive(pathname, href)
                      ? "bg-surface-2 font-medium text-ink"
                      : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon />
                  <span className="flex-1">{label}</span>
                  {label === "Strategies" && vaultCount > 0 && (
                    <span className="rounded bg-surface-2 px-1.5 text-xs text-ink-muted">
                      {vaultCount}
                    </span>
                  )}
                </Link>
              ))}

              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="mt-1 flex items-center gap-2.5 border-t border-border-subtle px-2.5 pt-3 text-sm text-ink-secondary transition-colors hover:text-ink"
              >
                <BookIcon />
                <span className="flex-1">Documentation</span>
                <ExternalIcon />
              </a>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
