"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAddress, decodeEventLog } from "viem";
import { useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { DemoBanner } from "@/components/DemoBanner";
import { useCanDeploy } from "@/hooks/useCanDeploy";
import { useWrongNetwork } from "@/hooks/useNetwork";
import { erc20Abi, vaultFactoryAbi } from "@/lib/abis";
import { ACTIVE_CHAIN_ID, VAULT_FACTORY_ADDRESS, wagmiConfig } from "@/lib/config";
import { IS_DEMO } from "@/lib/demo";
import { parseToken, shortenAddress } from "@/lib/format";

type Form = {
  baseAsset: string;
  shareName: string;
  shareSymbol: string;
  trader: string;
  feeRecipient: string;
  performanceFeePct: string;
  maxOracleAgeSeconds: string;
  maxPositionSize: string;
  depositCap: string;
  maxSingleAssetPct: string;
  maxDrawdownPct: string;
};

const EMPTY: Form = {
  baseAsset: "",
  shareName: "",
  shareSymbol: "",
  trader: "",
  feeRecipient: "",
  performanceFeePct: "20",
  maxOracleAgeSeconds: "3600",
  maxPositionSize: "",
  depositCap: "",
  maxSingleAssetPct: "40",
  maxDrawdownPct: "15",
};

const pct = (v: string) => Number(v);

export default function NewStrategy() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const { isWrongNetwork } = useWrongNetwork();
  const deploy = useCanDeploy();

  const [form, setForm] = useState<Form>(EMPTY);
  const [status, setStatus] = useState<"idle" | "deploying" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Confirm the base asset really is a token, and learn its decimals -- the
  // position cap is denominated in its units, so it can't be parsed without.
  const baseAssetValid = isAddress(form.baseAsset);
  const { data: baseInfo, isError: baseAssetUnreadable } = useReadContracts({
    contracts: [
      {
        address: form.baseAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: "symbol",
        chainId: ACTIVE_CHAIN_ID,
      },
      {
        address: form.baseAsset as `0x${string}`,
        abi: erc20Abi,
        functionName: "decimals",
        chainId: ACTIVE_CHAIN_ID,
      },
    ],
    query: { enabled: baseAssetValid, retry: false },
  });

  const baseSymbol = baseInfo?.[0]?.result as string | undefined;
  const baseDecimals = baseInfo?.[1]?.result as number | undefined;
  const baseAssetResolved = baseAssetValid && baseSymbol !== undefined && baseDecimals !== undefined;

  const problems = validate(form, {
    baseAssetValid,
    baseAssetResolved,
    maxFeeBps: deploy.maxFeeBps,
  });
  const ready = problems.length === 0 && !isWrongNetwork && deploy.canDeploy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || baseDecimals === undefined || !VAULT_FACTORY_ADDRESS) return;
    setError(null);
    setStatus("deploying");
    try {
      const hash = await writeContractAsync({
        address: VAULT_FACTORY_ADDRESS,
        abi: vaultFactoryAbi,
        functionName: "deployVault",
        chainId: ACTIVE_CHAIN_ID,
        args: [
          {
            baseAsset: form.baseAsset as `0x${string}`,
            shareName: form.shareName.trim(),
            shareSymbol: form.shareSymbol.trim(),
            trader: form.trader as `0x${string}`,
            feeRecipient: form.feeRecipient as `0x${string}`,
            performanceFeeBps: BigInt(Math.round(pct(form.performanceFeePct) * 100)),
            maxOracleAge: BigInt(form.maxOracleAgeSeconds || "0"),
            depositCap: form.depositCap ? parseToken(form.depositCap, baseDecimals) : 0n,
            caps: {
              maxPositionSize: parseToken(form.maxPositionSize, baseDecimals),
              maxSingleAssetBps: BigInt(Math.round(pct(form.maxSingleAssetPct) * 100)),
              maxDrawdownBps: BigInt(Math.round(pct(form.maxDrawdownPct) * 100)),
            },
          },
        ],
      });

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      await queryClient.invalidateQueries();

      // Go straight to the vault that was just created, rather than making
      // the operator hunt for it in the list.
      const deployed = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({ abi: vaultFactoryAbi, data: log.data, topics: log.topics });
          } catch {
            return null;
          }
        })
        .find((d) => d?.eventName === "VaultDeployed");

      const vaultAddress = (deployed?.args as { vault?: string } | undefined)?.vault;
      router.push(vaultAddress ? `/vault/${vaultAddress}` : "/strategies");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Deployment failed");
    }
  }

  if (IS_DEMO) {
    return (
      <>
        <DemoBanner />
        <div className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">New strategy</h1>
          <p className="mt-3 max-w-prose text-sm text-ink-secondary">
            Disabled in preview — there is no factory configured to deploy into. With one live,
            an approved operator fills in the base asset, trader and risk caps here, and the
            factory deploys a vault, share token, risk manager and strategy executor as one unit.
          </p>
          <Link href="/strategies" className="mt-4 inline-block text-sm text-accent hover:underline">
            ← Back to strategies
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Link href="/strategies" className="inline-block text-sm text-ink-muted hover:text-ink">
        ← All strategies
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">New strategy</h1>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        Deploys a vault, its share token, risk manager and strategy executor as one unit. You
        will own the vault; the trader you name can only route swaps within the caps below.
      </p>

      {!deploy.canDeploy && <AccessNotice deploy={deploy} />}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <Section title="Asset" hint="What the vault accounts in." disabled={!deploy.canDeploy}>
          <Field
            label="Base asset"
            hint={
              baseAssetResolved
                ? `${baseSymbol} · ${baseDecimals} decimals`
                : baseAssetValid && baseAssetUnreadable
                  ? "No ERC-20 found at this address on this network"
                  : "The ERC-20 contract address depositors will pay in"
            }
            tone={baseAssetValid && baseAssetUnreadable ? "bad" : baseAssetResolved ? "good" : "muted"}
          >
            <input
              value={form.baseAsset}
              onChange={set("baseAsset")}
              placeholder="0x…"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
        </Section>

        <Section
          title="Share token"
          hint="What depositors receive for their stake."
          disabled={!deploy.canDeploy}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                value={form.shareName}
                onChange={set("shareName")}
                placeholder="Basis Carry Share"
                className={inputClass}
              />
            </Field>
            <Field label="Symbol">
              <input
                value={form.shareSymbol}
                onChange={set("shareSymbol")}
                placeholder="vECOM"
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="People"
          hint="Neither address can withdraw the vault's funds."
          disabled={!deploy.canDeploy}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trader" hint="May route swaps, nothing else">
              <input
                value={form.trader}
                onChange={set("trader")}
                placeholder="0x…"
                spellCheck={false}
                className={inputClass}
              />
            </Field>
            <Field label="Fee recipient" hint="Receives performance-fee shares">
              <input
                value={form.feeRecipient}
                onChange={set("feeRecipient")}
                placeholder="0x…"
                spellCheck={false}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Launch guard"
          hint="A ceiling on how much the vault will take. Raise it later, or pause the vault entirely, from the owner wallet."
          disabled={!deploy.canDeploy}
        >
          <Field
            label="Deposit cap"
            hint={
              baseSymbol
                ? `total NAV ceiling in ${baseSymbol} — leave blank for uncapped`
                : "leave blank for uncapped"
            }
          >
            <input
              value={form.depositCap}
              onChange={set("depositCap")}
              type="number"
              min="0"
              step="any"
              placeholder="uncapped"
              className={inputClass}
            />
          </Field>
        </Section>

        <Section
          title="Risk caps"
          hint="Enforced around every trade. A breach reverts the transaction."
          disabled={!deploy.canDeploy}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Max position size"
              hint={baseSymbol ? `per trade, in ${baseSymbol}` : "per trade"}
            >
              <input
                value={form.maxPositionSize}
                onChange={set("maxPositionSize")}
                type="number"
                min="0"
                step="any"
                placeholder="25000"
                className={inputClass}
              />
            </Field>
            <Field label="Max single-asset" hint="% of NAV in one non-base asset">
              <input
                value={form.maxSingleAssetPct}
                onChange={set("maxSingleAssetPct")}
                type="number"
                min="0"
                max="100"
                step="any"
                className={inputClass}
              />
            </Field>
            <Field label="Max drawdown" hint="% below the high-water mark">
              <input
                value={form.maxDrawdownPct}
                onChange={set("maxDrawdownPct")}
                type="number"
                min="0"
                max="100"
                step="any"
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="Fee &amp; pricing" disabled={!deploy.canDeploy}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Performance fee"
              hint={`% of profit above the high-water mark · max ${deploy.maxFeeBps / 100}%`}
            >
              <input
                value={form.performanceFeePct}
                onChange={set("performanceFeePct")}
                type="number"
                min="0"
                max={deploy.maxFeeBps / 100}
                step="any"
                className={inputClass}
              />
            </Field>
            <Field
              label="Max oracle age"
              hint={
                deploy.hasOracle
                  ? "seconds before a DIA price is treated as stale"
                  : "unused — this factory has no oracle, so the vault holds only its base asset"
              }
            >
              <input
                value={form.maxOracleAgeSeconds}
                onChange={set("maxOracleAgeSeconds")}
                type="number"
                min="0"
                step="1"
                disabled={!deploy.hasOracle}
                className={`${inputClass} disabled:opacity-50`}
              />
            </Field>
          </div>
        </Section>

        {problems.length > 0 && (
          <ul className="grid gap-1 rounded-xl border border-border-subtle bg-surface-1 p-4 text-xs text-ink-muted">
            {problems.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}

        {!deploy.boundsEnforcedOnChain && deploy.canDeploy && (
          <p className="text-xs text-ink-muted">
            This factory predates on-chain parameter bounds, so the limits above are checked here
            but not by the contract. A redeployed factory enforces them.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!ready || status === "deploying"}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-on transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {status === "deploying"
              ? "Deploying…"
              : isWrongNetwork
                ? "Wrong network"
                : "Deploy vault"}
          </button>
          <span className="text-xs text-ink-muted">
            Deploys four contracts in one transaction.
          </span>
        </div>

        {error && <p className="text-xs text-critical">{error}</p>}
      </form>
    </>
  );
}

function AccessNotice({ deploy }: { deploy: ReturnType<typeof useCanDeploy> }) {
  if (deploy.isLoading) return null;

  return (
    <div className="mt-6 rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h2 className="text-sm font-medium text-ink">
        {deploy.isConnected ? "This wallet cannot deploy vaults" : "Connect a wallet to continue"}
      </h2>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        {deploy.isLegacyFactory
          ? "The deployed factory predates the operator allowlist, so only its owner can create vaults."
          : "Vault creation is limited to the factory owner and operators they have approved, while the protocol is unaudited. An unrestricted factory would let anyone publish a vault into this same interface."}
        {deploy.owner && (
          <>
            {" "}
            The owner is{" "}
            <code className="font-mono text-xs">{shortenAddress(deploy.owner)}</code>.
          </>
        )}
      </p>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

function Section({
  title,
  hint,
  disabled,
  children,
}: {
  title: string;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="rounded-xl border border-border-subtle bg-surface-1 p-5 disabled:opacity-60"
    >
      <legend className="px-1 text-sm font-medium text-ink">{title}</legend>
      {hint && <p className="mb-3 text-xs text-ink-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  tone = "muted",
  children,
}: {
  label: string;
  hint?: string;
  tone?: "muted" | "good" | "bad";
  children: React.ReactNode;
}) {
  const hintClass =
    tone === "good" ? "text-good" : tone === "bad" ? "text-critical" : "text-ink-muted";
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-secondary">{label}</span>
      {children}
      {hint && <span className={`mt-1 block text-xs ${hintClass}`}>{hint}</span>}
    </label>
  );
}

/**
 * Mirrors VaultFactory's own checks so an operator sees the problem before
 * paying gas for a revert. The contract remains the authority.
 */
function validate(
  f: Form,
  ctx: { baseAssetValid: boolean; baseAssetResolved: boolean; maxFeeBps: number }
): string[] {
  const out: string[] = [];

  if (!f.baseAsset) out.push("Base asset is required.");
  else if (!ctx.baseAssetValid) out.push("Base asset is not a valid address.");
  else if (!ctx.baseAssetResolved) out.push("Base asset does not respond as an ERC-20 token.");

  if (!f.shareName.trim()) out.push("Share token needs a name.");
  if (!f.shareSymbol.trim()) out.push("Share token needs a symbol.");

  if (!isAddress(f.trader)) out.push("Trader must be a valid address.");
  if (!isAddress(f.feeRecipient)) out.push("Fee recipient must be a valid address.");

  const fee = pct(f.performanceFeePct);
  if (!Number.isFinite(fee) || fee < 0) out.push("Performance fee must be zero or more.");
  else if (fee > ctx.maxFeeBps / 100)
    out.push(`Performance fee cannot exceed ${ctx.maxFeeBps / 100}%.`);

  if (f.depositCap) {
    const cap = Number(f.depositCap);
    if (!Number.isFinite(cap) || cap < 0) out.push("Deposit cap cannot be negative.");
  }

  const size = Number(f.maxPositionSize);
  if (!f.maxPositionSize || !Number.isFinite(size) || size <= 0)
    out.push("Max position size must be above zero, or no trade can ever execute.");

  for (const [label, value] of [
    ["Max single-asset", f.maxSingleAssetPct],
    ["Max drawdown", f.maxDrawdownPct],
  ] as const) {
    const n = pct(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) out.push(`${label} must be between 0 and 100%.`);
  }

  return out;
}
