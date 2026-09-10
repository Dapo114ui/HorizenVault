"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, vaultAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID, wagmiConfig } from "@/lib/config";
import { useWrongNetwork } from "@/hooks/useNetwork";
import { formatToken, parseToken } from "@/lib/format";

export function WithdrawForm({
  vaultAddress,
  shareTokenAddress,
  shareSymbol,
}: {
  vaultAddress: `0x${string}`;
  shareTokenAddress: `0x${string}`;
  shareSymbol: string;
}) {
  const { address: userAddress } = useAccount();
  const { isWrongNetwork } = useWrongNetwork();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "withdrawing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();

  const { data: shareBalance } = useReadContract({
    address: shareTokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(userAddress) },
  });

  const amountBig = amount ? parseToken(amount, 18) : 0n;

  async function handleSubmit() {
    if (!userAddress || amountBig <= 0n) return;
    setError(null);
    setStatus("withdrawing");
    try {
      const hash = await writeContractAsync({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: "withdraw",
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
        <h3 className="font-medium text-ink">Withdraw</h3>
        <span className="tabular text-xs text-ink-muted">
          {formatToken(shareBalance)} {shareSymbol}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">Burns shares for a pro-rata slice of NAV.</p>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={status === "withdrawing"}
          className="tabular w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
        />
        <button
          onClick={handleSubmit}
          disabled={!userAddress || isWrongNetwork || amountBig <= 0n || status === "withdrawing"}
          className="whitespace-nowrap rounded-lg border border-border-strong px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          {isWrongNetwork ? "Wrong network" : status === "withdrawing" ? "Withdrawing…" : "Withdraw"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
    </div>
  );
}
