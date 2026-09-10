"use client";

import { useEffect, useState } from "react";

/**
 * The Horizen Vault logo.
 *
 * Draws a placeholder mark, and upgrades to a real asset the moment one is
 * present in `public/` -- so dropping a file in is the whole install, and no
 * build step or code change is needed. Candidates are tried in order: SVG
 * scales cleanly at chrome sizes, so it wins where both exist.
 *
 * The drawn fallback is an approximation, not the brand. It exists so the
 * app is never unbranded, not as a substitute for the real mark.
 */

const WORDMARK_SOURCES = ["/logo.svg", "/logo.png", "/logo.webp"];
const MARK_SOURCES = ["/logo-mark.svg", "/logo-mark.png", "/logo-mark.webp"];

/**
 * The mark: a sealed enclosure with a single slot.
 *
 * It is a vault door read flat -- a closed shape you can put something into
 * and not see back out of, which is the whole proposition. The slot is drawn
 * in the brand violet because it is the only opening in the shape, and the
 * only thing this protocol lets you see is what it deliberately publishes.
 */
function DrawnGlyph() {
  return (
    <>
      <rect
        x="6"
        y="5"
        width="28"
        height="28"
        rx="7"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path d="M20 12 V21" stroke="var(--brand)" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="20" cy="26" r="2.4" fill="var(--brand)" />
    </>
  );
}

function DrawnWordmark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 150 38" fill="none" className={className} role="img" aria-label="Horizen Vault">
      <DrawnGlyph />
      <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M48 6 L55 32 L62 6" />
        <path d="M68 32 L75 6 L82 32" />
        <path d="M88 6 V24 a7 7 0 0 0 14 0 V6" />
        <path d="M108 6 V32 H122" />
        <path d="M126 6 H144 M135 6 V32" />
      </g>
    </svg>
  );
}

function DrawnMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 38" fill="none" className={className} role="img" aria-label="Horizen Vault">
      <DrawnGlyph />
    </svg>
  );
}

/**
 * Renders the drawn mark, and swaps in a real asset only once one has been
 * confirmed to load.
 *
 * The obvious shape -- render `<img>` and fall back in `onError` -- loses a
 * race it cannot win. The markup is server-rendered, so the browser can
 * request the image and fail before React hydrates and attaches the handler;
 * React does not replay an error that already fired, so the fallback never
 * runs and the page shows a broken image indefinitely. Probing first inverts
 * that: the worst case is the drawn mark, which is always fine.
 */
function AssetOrFallback({
  sources,
  className,
  Fallback,
}: {
  sources: string[];
  className: string;
  Fallback: ({ className }: { className: string }) => React.ReactElement;
}) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Try each candidate in order; the first that loads wins. SVG leads the
    // list because it scales cleanly at chrome sizes.
    (async () => {
      for (const src of sources) {
        const ok = await new Promise<boolean>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(true);
          probe.onerror = () => resolve(false);
          probe.src = src;
        });
        if (cancelled) return;
        if (ok) {
          setResolved(src);
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sources]);

  if (!resolved) return <Fallback className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolved} alt="Horizen Vault" className={className} />
  );
}

/** Full lockup, for the sidebar. */
export function Wordmark({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <AssetOrFallback sources={WORDMARK_SOURCES} className={className} Fallback={DrawnWordmark} />
  );
}

/** Monogram only, for the mobile header and other tight spots. */
export function LogoMark({ className = "h-6 w-auto" }: { className?: string }) {
  return <AssetOrFallback sources={MARK_SOURCES} className={className} Fallback={DrawnMark} />;
}
