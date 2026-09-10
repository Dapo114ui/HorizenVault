/**
 * Deploys VaultFactory and (optionally) a first vault to Horizen.
 *
 * Unlike deploy-local.js this deploys no mocks -- every external address must
 * be supplied. A vault holding only its base asset never calls the router or
 * the oracle, so ROUTER_ADDRESS/ORACLE_ADDRESS may be left unset for a
 * deposit-and-withdraw-only v1; the script then wires address(0) and refuses
 * to track any asset, which keeps that vault honestly non-trading rather than
 * pointed at a placeholder.
 *
 * Required:
 *   BASE_ASSET_ADDRESS   ERC-20 the vault accounts in (e.g. USDC.e on Horizen)
 * Optional:
 *   ROUTER_ADDRESS       swap venue router; omit for a non-trading vault
 *   ORACLE_ADDRESS       Stork oracle; defaults to the documented Horizen address
 *   TRADER_ADDRESS       defaults to the deployer
 *   FEE_RECIPIENT        defaults to the deployer
 *   PERFORMANCE_FEE_BPS  defaults to 2000 (20%)
 *   MAX_ORACLE_AGE       seconds, defaults to 3600
 *   SKIP_VAULT=1         deploy only the factory
 */
const { ethers } = require("hardhat");

const ZERO = "0x0000000000000000000000000000000000000000";

function requireAddress(name, value) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address (got: ${value ?? "unset"})`);
  }
  return ethers.getAddress(value);
}

function optionalAddress(name, value) {
  if (!value) return ZERO;
  return requireAddress(name, value);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`\nNetwork:  ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}\n`);
  if (balance === 0n) {
    throw new Error("Deployer has no balance for gas — fund it from the network's faucet first.");
  }

  const baseAssetAddress = requireAddress("BASE_ASSET_ADDRESS", process.env.BASE_ASSET_ADDRESS);
  const routerAddress = optionalAddress("ROUTER_ADDRESS", process.env.ROUTER_ADDRESS);
  // Stork sits at the same address on Horizen mainnet and testnet, so unlike
  // the router there is a real default to fall back to.
  const STORK_ON_HORIZEN = "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62";
  const oracleAddress = optionalAddress(
    "ORACLE_ADDRESS",
    process.env.ORACLE_ADDRESS ?? STORK_ON_HORIZEN
  );
  const trader = process.env.TRADER_ADDRESS
    ? requireAddress("TRADER_ADDRESS", process.env.TRADER_ADDRESS)
    : deployer.address;
  const feeRecipient = process.env.FEE_RECIPIENT
    ? requireAddress("FEE_RECIPIENT", process.env.FEE_RECIPIENT)
    : deployer.address;
  const performanceFeeBps = BigInt(process.env.PERFORMANCE_FEE_BPS ?? 2000);
  const maxOracleAge = BigInt(process.env.MAX_ORACLE_AGE ?? 3600);
  // A guarded launch wants a ceiling from the first block, not one set a
  // transaction later. Expressed in whole base-asset units; 0 is uncapped.
  const depositCapUnits = BigInt(process.env.DEPOSIT_CAP ?? 0);

  // Confirm the base asset really is an ERC-20 before committing gas, and read
  // its decimals so the caps below are expressed in its own units.
  const base = await ethers.getContractAt("IERC20Metadata", baseAssetAddress);
  const baseSymbol = await base.symbol();
  const baseDecimals = await base.decimals();
  console.log(`Base asset: ${baseSymbol} (${baseDecimals} decimals) at ${baseAssetAddress}`);

  if (routerAddress === ZERO || oracleAddress === ZERO) {
    console.log(
      "\n! ROUTER_ADDRESS/ORACLE_ADDRESS not both set — deploying a non-trading vault.\n" +
        "  Deposits and withdrawals work; trading needs a redeploy once a swap\n" +
        "  router address on Horizen is identified — see docs/RESEARCH_NOTES.md.\n"
    );
  }

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(deployer.address, routerAddress, oracleAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`VaultFactory: ${factoryAddress}`);

  if (process.env.SKIP_VAULT === "1") {
    printEnv(network, factoryAddress);
    return;
  }

  const unit = 10n ** BigInt(baseDecimals);
  const tx = await factory.deployVault({
    baseAsset: baseAssetAddress,
    shareName: `${baseSymbol} Vault Share`,
    shareSymbol: `v${baseSymbol}`,
    trader,
    feeRecipient,
    performanceFeeBps,
    maxOracleAge,
    depositCap: depositCapUnits * unit,
    caps: {
      maxPositionSize: 25_000n * unit,
      maxSingleAssetBps: 4_000, // 40% of NAV in any one non-base asset
      maxDrawdownBps: 1_500, // 15% from the high-water mark
    },
  });
  const receipt = await tx.wait();
  const deployed = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "VaultDeployed");

  console.log(`Vault:        ${deployed.args.vault}`);
  console.log(`ShareToken:   ${deployed.args.shareToken}`);
  console.log(`RiskManager:  ${deployed.args.riskManager}`);
  console.log(`Executor:     ${deployed.args.strategyExecutor}`);
  console.log(`Trader:       ${trader}`);

  printEnv(network, factoryAddress);
}

function printEnv(network, factoryAddress) {
  console.log("\n--- frontend/.env.local (and the same three in Vercel) ---");
  console.log(`NEXT_PUBLIC_CHAIN_ID=${network.chainId}`);
  console.log(`NEXT_PUBLIC_RPC_URL=${process.env.X1_TESTNET_RPC_URL ?? "<rpc url>"}`);
  console.log(`NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${factoryAddress}`);
  console.log("\nSetting these switches the app out of preview mode.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
