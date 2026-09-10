import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhat } from "viem/chains";
import { defineChain } from "viem";

const CONFIGURED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 0);

// Local Hardhat is the target only when nothing else is configured (or it is
// explicitly configured), so a production build never defaults to localhost.
const isLocal = !CONFIGURED_CHAIN_ID || CONFIGURED_CHAIN_ID === hardhat.id;

/**
 * Horizen Chain -- an OP Stack L3 settling on Base. Both networks come from
 * Horizen's own documentation rather than a third-party chain list.
 *
 * Note the native currency. Gas on Horizen is paid in **ETH**, exactly as on
 * Base: there is no separate gas token, and ZEN is not one -- it is an ERC-20
 * with a LayerZero representation on the chain. Labelling the gas token ZEN
 * would send every visitor hunting for the wrong asset to fund their wallet.
 */
export const horizenTestnet = defineChain({
  id: 2651420,
  name: "Horizen Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://horizen-testnet.rpc.caldera.xyz/http"] },
  },
  blockExplorers: {
    default: { name: "Horizen Testnet Explorer", url: "https://explorer-testnet.horizen.io" },
  },
  testnet: true,
});

export const horizenMainnet = defineChain({
  id: 26514,
  name: "Horizen",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://horizen.calderachain.xyz/http"] },
  },
  blockExplorers: {
    default: { name: "Horizen Explorer", url: "https://explorer.horizen.io" },
  },
});

/**
 * The chain this deployment reads from, selected by environment so one build
 * can target either network. An unrecognised id with an RPC behind it is taken
 * at face value; without one it falls back to testnet, because a misconfigured
 * variable should show the wrong network in the banner rather than a blank page.
 */
function resolveChain() {
  if (isLocal) return hardhat;
  if (CONFIGURED_CHAIN_ID === horizenMainnet.id) return horizenMainnet;
  if (CONFIGURED_CHAIN_ID === horizenTestnet.id) return horizenTestnet;

  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpc) return horizenTestnet;

  return defineChain({
    id: CONFIGURED_CHAIN_ID,
    name: `Chain ${CONFIGURED_CHAIN_ID}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    testnet: true,
  });
}

/**
 * Every contract read pins itself to this explicitly: without it wagmi follows
 * the *wallet's* current chain, so a visitor whose MetaMask sits on Ethereum
 * sees an app that loads no vaults at all and offers no explanation.
 */
export const ACTIVE_CHAIN = resolveChain();
export const ACTIVE_CHAIN_ID = ACTIVE_CHAIN.id;

const isKnownChain =
  ACTIVE_CHAIN_ID === hardhat.id ||
  ACTIVE_CHAIN_ID === horizenTestnet.id ||
  ACTIVE_CHAIN_ID === horizenMainnet.id;

export const wagmiConfig = createConfig({
  chains: isLocal
    ? [hardhat, horizenTestnet, horizenMainnet]
    : [ACTIVE_CHAIN, horizenTestnet, horizenMainnet, hardhat],
  connectors: [injected()],
  transports: {
    // `http(undefined)` falls back to the chain's own default RPC, so a local
    // node on a non-default port is still reachable via NEXT_PUBLIC_RPC_URL.
    [hardhat.id]: http(isLocal ? process.env.NEXT_PUBLIC_RPC_URL : undefined),
    [horizenTestnet.id]: http(
      ACTIVE_CHAIN_ID === horizenTestnet.id ? process.env.NEXT_PUBLIC_RPC_URL : undefined,
    ),
    [horizenMainnet.id]: http(
      ACTIVE_CHAIN_ID === horizenMainnet.id ? process.env.NEXT_PUBLIC_RPC_URL : undefined,
    ),
    ...(isKnownChain ? {} : { [ACTIVE_CHAIN_ID]: http(process.env.NEXT_PUBLIC_RPC_URL) }),
  },
});

/**
 * Link into the active chain's block explorer, or `undefined` when it has
 * none -- the local Hardhat chain doesn't, so callers render plain text
 * rather than a dead link.
 */
export function explorerUrl(
  kind: "address" | "tx" | "block",
  value: string | number | bigint,
): string | undefined {
  const base = (ACTIVE_CHAIN as { blockExplorers?: { default?: { url?: string } } })
    .blockExplorers?.default?.url;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/${kind}/${value}`;
}

export const VAULT_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as
  | `0x${string}`
  | undefined;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
