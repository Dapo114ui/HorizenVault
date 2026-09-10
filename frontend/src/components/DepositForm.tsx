"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID, wagmiConfig } from "@/lib/config";
import { useWrongNetwork } from "@/hooks/useNetwork";
import { formatToken, parseToken } from "@/lib/format";

export function DepositForm({
  vaultAddress,
  baseAssetAddress,
  baseAssetDecimals,
  baseAssetSymbol,
  isPaused = false,
  depositCap,
  nav,
}: {
  vaultAddress: `0x${string}`;
  baseAssetAddress: `0x${string}`;
  baseAssetDecimals: number;
  baseAssetSymbol: string;
  isPaused?: boolean;
  /** Zero means uncapped, matching the contract. */
  depositCap?: bigint;
  nav?: bigint;
}) {
  const { address: userAddress } = useAccount();
  const { isWrongNetwork } = useWrongNetwork();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "approving" | "depositing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();

  const { data: balance } = useReadContract({
    address: baseAssetAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(userAddress) },
  });

  const { data: allowance } = useReadContract({
    address: baseAssetAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: userAddress ? [userAddress, vaultAddress] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(userAddress) },
  });

  const amountBig = amount ? parseToken(amount, baseAssetDecimals) : 0n;
  const needsApproval = amountBig > 0n && (allowance ?? 0n) < amountBig;
  const isBusy = status === "approving" || status === "depositing";

  const capped = depositCap !== undefined && depositCap > 0n;
  const room = capped && nav !== undefined ? (depositCap > nav ? depositCap - nav : 0n) : undefined;
  const overCap = room !== undefined && amountBig > room;
  const blocked = isPaused || (room !== undefined && room === 0n);

  async function handleSubmit() {
    if (!userAddress || amountBig <= 0n) return;
    setError(null);
    try {
      if (needsApproval) {
        setStatus("approving");
        const hash = await writeContractAsync({
          address: baseAssetAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [vaultAddress, amountBig],
          chainId: ACTIVE_CHAIN_ID,
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
        await queryClient.invalidateQueries();
      }
      setStatus("depositing");
      const hash = await writeContractAsync({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: "deposit",
        args: [amountBig],
        chainId: ACTIVE_CHAIN_ID,
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      await queryClient.invalidateQueries();
      setAmount("");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-ink">Deposit</h3>
        <span className="tabular text-xs text-ink-muted">
          {formatToken(balance, baseAssetDecimals)} {baseAssetSymbol}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {isPaused
          ? "Paused by the vault owner. Withdrawals still work."
          : room !== undefined && room === 0n
            ? "The vault has reached its deposit cap."
            : "Mints shares pro-rata to current NAV."}
      </p>
      {room !== undefined && room > 0n && (
        <p className="mt-1 text-xs text-ink-muted">
          Room below the cap: {formatToken(room, baseAssetDecimals)} {baseAssetSymbol}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={isBusy}
          className="tabular w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
        />
        <button
          onClick={handleSubmit}
          disabled={!userAddress || isWrongNetwork || blocked || overCap || amountBig <= 0n || isBusy}
          className="whitespace-nowrap rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-on transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isPaused
            ? "Paused"
            : blocked
              ? "Cap reached"
              : overCap
                ? "Over cap"
                : isWrongNetwork
                  ? "Wrong network"
                  : status === "approving"
              ? "Approving…"
              : status === "depositing"
                ? "Depositing…"
                : needsApproval
                  ? "Approve & deposit"
                  : "Deposit"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
    </div>
  );
}
