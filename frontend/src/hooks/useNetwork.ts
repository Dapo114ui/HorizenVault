"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ACTIVE_CHAIN, ACTIVE_CHAIN_ID } from "@/lib/config";

/**
 * Whether the connected wallet is pointed somewhere other than the chain this
 * deployment reads from. Reads are pinned to the active chain, so vault data
 * still loads -- but writes would go to the wrong network, so they are gated
 * on this.
 */
export function useWrongNetwork() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  return {
    isWrongNetwork: isConnected && chainId !== undefined && chainId !== ACTIVE_CHAIN_ID,
    expected: ACTIVE_CHAIN,
    switchToActive: () => switchChain({ chainId: ACTIVE_CHAIN_ID }),
    isSwitching: isPending,
  };
}
