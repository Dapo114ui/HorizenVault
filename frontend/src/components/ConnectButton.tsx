"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortenAddress } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-good align-middle" />
        {shortenAddress(address)}
      </button>
    );
  }

  const connector = connectors[0];

  return (
    <button
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isPending}
      className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
