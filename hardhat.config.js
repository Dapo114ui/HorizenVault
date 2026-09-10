const path = require("path");
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// This sandbox's network egress policy blocks binaries.soliditylang.org, so
// Hardhat's default compiler download fails. The `solc` npm package ships
// the same compiler as a local soljson build reachable via the (allowed)
// npm registry -- use that instead of letting Hardhat try to fetch one.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    const compilerPath = require.resolve("solc/soljson.js");
    return {
      compilerPath,
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: args.solcVersion,
    };
  }
  return runSuper(args);
});

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    // Horizen Chain: an OP Stack L3 settling on Base. Both networks below
    // are taken from Horizen's own published documentation rather than a
    // third-party chain list. Gas is paid in ETH -- there is no separate gas
    // token, and ZEN is not one.
    horizenTestnet: {
      url: process.env.HORIZEN_TESTNET_RPC_URL || "https://horizen-testnet.rpc.caldera.xyz/http",
      chainId: process.env.HORIZEN_TESTNET_CHAIN_ID
        ? Number(process.env.HORIZEN_TESTNET_CHAIN_ID)
        : 2651420,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
    horizenMainnet: {
      url: process.env.HORIZEN_MAINNET_RPC_URL || "https://horizen.calderachain.xyz/http",
      chainId: process.env.HORIZEN_MAINNET_CHAIN_ID
        ? Number(process.env.HORIZEN_MAINNET_CHAIN_ID)
        : 26514,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
};
