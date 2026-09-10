"use client";

import { useAccount, useReadContract } from "wagmi";
import { vaultFactoryAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID, VAULT_FACTORY_ADDRESS } from "@/lib/config";

/** Client-side mirror of VaultFactory.MAX_PERFORMANCE_FEE_BPS. */
export const FALLBACK_MAX_FEE_BPS = 3_000;

/**
 * Whether the connected wallet may deploy a vault, and under which factory.
 *
 * The factory currently live predates the deployer allowlist, so
 * `isApprovedDeployer` and `MAX_PERFORMANCE_FEE_BPS` do not exist on it and
 * those reads fail. That is a legacy factory, not an error: deployment there
 * is owner-only and the parameter bounds are not enforced on-chain, so the
 * form still validates them itself and says the bounds are advisory.
 */
export function useCanDeploy() {
  const { address, isConnected } = useAccount();

  const common = {
    address: VAULT_FACTORY_ADDRESS,
    abi: vaultFactoryAbi,
    chainId: ACTIVE_CHAIN_ID,
  } as const;

  const { data: owner, isLoading: ownerLoading } = useReadContract({
    ...common,
    functionName: "owner",
    query: { enabled: Boolean(VAULT_FACTORY_ADDRESS) },
  });

  const { data: maxFeeBps, isError: noMaxFee, isLoading: maxFeeLoading } = useReadContract({
    ...common,
    functionName: "MAX_PERFORMANCE_FEE_BPS",
    query: { enabled: Boolean(VAULT_FACTORY_ADDRESS), retry: false },
  });

  const { data: approved, isLoading: approvedLoading } = useReadContract({
    ...common,
    functionName: "isApprovedDeployer",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(VAULT_FACTORY_ADDRESS && address), retry: false },
  });

  const { data: oracle } = useReadContract({
    ...common,
    functionName: "oracle",
    query: { enabled: Boolean(VAULT_FACTORY_ADDRESS) },
  });

  const isLegacyFactory = noMaxFee;
  const isOwner = Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
  const isApproved = Boolean(approved);

  return {
    isConnected,
    address,
    owner,
    isOwner,
    isApproved,
    canDeploy: isOwner || (!isLegacyFactory && isApproved),
    isLegacyFactory,
    /** Bounds are only enforced on-chain by a factory that knows about them. */
    boundsEnforcedOnChain: !isLegacyFactory,
    maxFeeBps: maxFeeBps !== undefined ? Number(maxFeeBps) : FALLBACK_MAX_FEE_BPS,
    /** A factory wired to the zero oracle can never price a non-base asset. */
    hasOracle: Boolean(
      oracle && oracle !== "0x0000000000000000000000000000000000000000"
    ),
    isLoading: ownerLoading || maxFeeLoading || approvedLoading,
  };
}
