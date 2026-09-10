"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, vaultAbi, vaultFactoryAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID, VAULT_FACTORY_ADDRESS } from "@/lib/config";

/** Every vault the factory has deployed. */
export function useVaultAddresses() {
  const { data: vaultsCount } = useReadContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: vaultFactoryAbi,
    functionName: "vaultsCount",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(VAULT_FACTORY_ADDRESS) },
  });

  const count = vaultsCount !== undefined ? Number(vaultsCount) : 0;

  const { data } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: VAULT_FACTORY_ADDRESS,
      abi: vaultFactoryAbi,
      functionName: "vaults" as const,
      args: [BigInt(i)] as const,
      chainId: ACTIVE_CHAIN_ID,
    })),
    query: { enabled: count > 0 },
  });

  const addresses = (data ?? [])
    .map((entry) => entry.result as `0x${string}` | undefined)
    .filter((a): a is `0x${string}` => Boolean(a));

  return { count, addresses };
}

/**
 * The connected wallet's position across every vault, plus protocol totals.
 * Derived entirely from current state -- shares held x NAV/share -- so it
 * needs no indexer. Cost basis (and therefore realised P&L per depositor)
 * would: shares are transferable, so it can't be recovered from state alone.
 */
export function usePortfolio() {
  const { address: userAddress } = useAccount();
  const { addresses } = useVaultAddresses();

  const { data: vaultState } = useReadContracts({
    contracts: addresses.flatMap((vault) => [
      { address: vault, abi: vaultAbi, functionName: "nav" as const, chainId: ACTIVE_CHAIN_ID },
      { address: vault, abi: vaultAbi, functionName: "navPerShare" as const, chainId: ACTIVE_CHAIN_ID },
      { address: vault, abi: vaultAbi, functionName: "shareToken" as const, chainId: ACTIVE_CHAIN_ID },
      { address: vault, abi: vaultAbi, functionName: "baseDecimals" as const, chainId: ACTIVE_CHAIN_ID },
    ]),
    query: { enabled: addresses.length > 0 },
  });

  const perVault = addresses.map((vault, i) => ({
    vault,
    nav: vaultState?.[i * 4]?.result as bigint | undefined,
    navPerShare: vaultState?.[i * 4 + 1]?.result as bigint | undefined,
    shareToken: vaultState?.[i * 4 + 2]?.result as `0x${string}` | undefined,
    baseDecimals: vaultState?.[i * 4 + 3]?.result as number | undefined,
  }));

  const { data: balances } = useReadContracts({
    contracts: perVault.map(({ shareToken }) => ({
      address: shareToken,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: userAddress ? ([userAddress] as const) : undefined,
      chainId: ACTIVE_CHAIN_ID,
    })),
    query: { enabled: Boolean(userAddress) && perVault.every((v) => Boolean(v.shareToken)) },
  });

  // Vaults may use base assets with different decimals, so normalise each to
  // 18 before summing -- adding raw balances across scales is meaningless.
  // (Cross-vault totals still assume every base asset is USD-denominated,
  // the same assumption Vault.nav() documents.)
  const totalNav = perVault.reduce((sum, v) => {
    if (v.nav === undefined || v.baseDecimals === undefined) return sum;
    return sum + v.nav * 10n ** BigInt(18 - v.baseDecimals);
  }, 0n);

  const positionValue = perVault.reduce((sum, v, i) => {
    const shares = balances?.[i]?.result as bigint | undefined;
    if (!shares || !v.navPerShare) return sum;
    return sum + (shares * v.navPerShare) / 10n ** 18n;
  }, 0n);

  const totalShares = perVault.reduce((sum, _v, i) => {
    const shares = balances?.[i]?.result as bigint | undefined;
    return sum + (shares ?? 0n);
  }, 0n);

  return { addresses, perVault, totalNav, positionValue, totalShares };
}
