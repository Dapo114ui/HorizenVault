"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { LogoMark } from "./Logo";
import { MobileNav } from "./MobileNav";
import { NetworkBanner } from "./NetworkBanner";
import { Sidebar } from "./Sidebar";

const CRUMB: Record<string, string> = {
  "/": "Overview",
  "/strategies": "Strategies",
  "/activity": "Activity",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const crumb = CRUMB[pathname] ?? (pathname.startsWith("/vault/") ? "Vault" : "");

  return (
    <div className="flex min-h-full">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5 sm:px-6">
          <MobileNav />
          <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            <Link href="/" aria-label="Horizen Vault home" className="shrink-0 lg:hidden">
              <LogoMark className="h-5 w-auto text-ink" />
            </Link>
            <Link href="/" className="hidden shrink-0 text-ink-muted hover:text-ink lg:inline">
              Vault
            </Link>
            {crumb && (
              <>
                <span className="text-ink-muted">/</span>
                <span className="truncate text-ink">{crumb}</span>
              </>
            )}
          </nav>
          <ConnectButton />
        </header>

        <NetworkBanner />

        <main className="flex-1 px-4 py-8 sm:px-6">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
