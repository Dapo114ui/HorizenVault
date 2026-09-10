"use client";

import { explorerUrl } from "@/lib/config";
import { shortenAddress } from "@/lib/format";

/**
 * A value that links into the block explorer where one exists, and reads as
 * plain text where it doesn't. For a protocol whose whole claim is that you
 * can check it yourself, every address on screen should be one tap from the
 * chain.
 */
export function ExplorerLink({
  kind,
  value,
  label,
  className = "",
}: {
  kind: "address" | "tx" | "block";
  value: string | number | bigint;
  /** Defaults to a shortened address, or the raw value for blocks and txs. */
  label?: string;
  className?: string;
}) {
  const href = explorerUrl(kind, value);
  const text =
    label ?? (kind === "address" ? shortenAddress(String(value)) : String(value));

  if (!href) return <span className={className}>{text}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`underline decoration-border-strong underline-offset-2 transition-colors hover:text-ink hover:decoration-current ${className}`}
    >
      {text}
    </a>
  );
}
