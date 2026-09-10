// Deploys the full mock + vault stack to a local Hardhat node, for
// exercising the frontend against real contract calls without depending on
// a Horizen RPC/address that isn't confirmed yet (see
// docs/RESEARCH_NOTES.md). Not used for testnet/mainnet deployment.
const { ethers } = require("hardhat");

// Stork's real ETHUSD feed id, from Horizen's oracle documentation.
const ETH_USD_FEED = "0x59102b37de83bdda9f38ac8254e596f0d9ac61d2035c07936675e87342817160";

async function main() {
  const [deployer, trader, feeRecipient, demoUser] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const baseAsset = await MockERC20.deploy("Mock USDT", "mUSDT", 18);
  const weth = await MockERC20.deploy("Mock Wrapped Ether", "mWETH", 18);
  await baseAsset.waitForDeployment();
  await weth.waitForDeployment();

  const MockStork = await ethers.getContractFactory("MockStork");
  const oracle = await MockStork.deploy();
  await oracle.waitForDeployment();
  await oracle.setPrice(ETH_USD_FEED, 10n ** 18n);

  const MockDexRouter = await ethers.getContractFactory("MockDexRouter");
  const router = await MockDexRouter.deploy();
  await router.waitForDeployment();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(
    deployer.address,
    await router.getAddress(),
    await oracle.getAddress()
  );
  await factory.waitForDeployment();

  const tx = await factory.deployVault({
    baseAsset: await baseAsset.getAddress(),
    shareName: "Demo Vault Share",
    shareSymbol: "dvSHARE",
    trader: trader.address,
    feeRecipient: feeRecipient.address,
    performanceFeeBps: 2_000,
    maxOracleAge: 3600,
    depositCap: 0n, // uncapped in tests/scripts unless set explicitly
    caps: {
      maxPositionSize: ethers.parseEther("10000"),
      maxSingleAssetBps: 10_000,
      maxDrawdownBps: 1_000,
    },
  });
  const receipt = await tx.wait();
  const deployedEvent = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "VaultDeployed");
  const vaultAddress = deployedEvent.args.vault;
  const vault = await ethers.getContractAt("Vault", vaultAddress);
  await vault.connect(deployer).trackAsset(await weth.getAddress(), ETH_USD_FEED);

  // Fund the demo account (Hardhat's default account #3) so the frontend has
  // something to deposit/approve immediately.
  await baseAsset.mint(demoUser.address, ethers.parseEther("10000"));

  console.log("\n--- Local deployment complete ---");
  console.log("baseAsset (mUSDT):     ", await baseAsset.getAddress());
  console.log("weth (mWETH):           ", await weth.getAddress());
  console.log("oracle:                ", await oracle.getAddress());
  console.log("router:                ", await router.getAddress());
  console.log("factory:               ", await factory.getAddress());
  console.log("vault:                 ", vaultAddress);
  console.log("demo user (funded):    ", demoUser.address);
  console.log("\nfrontend/.env.local:");
  console.log(`NEXT_PUBLIC_CHAIN_ID=31337`);
  console.log(`NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`);
  console.log(`NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=${await factory.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
