# Horizen Vault

A vault protocol for [Horizen](https://horizen.io) — an EVM-native L3 on Base
— being built against the [Horizen Builder Fund Season 2][fund] Category 1
RFP for **private agentic trading vaults**.

Depositors buy pro-rata shares in a strategy vault. A designated executor
trades the pooled funds without ever taking custody. Profit above the vault's
all-time-high NAV per share is charged a performance fee, and hard risk caps
enforced in the contract revert any trade that breaches them.

[fund]: https://horizen.io/builder-fund/

## Status

Two layers, at very different stages.

**The vault substrate is built and tested.** Positions in this layer are fully
public — it is the plaintext vault, ported from X1:

- Pooled deposits and pro-rata share accounting
- NAV valuation via Stork price feeds
- High-water-mark performance fees that never double-charge a recovery
- Hard, on-chain risk caps that revert rather than warn
- Per-strategy isolation with a curated deployer allowlist

**The confidential layer is designed, integrated and partly built.**
`ConfidentialRiskManager` enforces the same risk caps on positions nobody can
see: the vault publishes a Poseidon commitment instead of its balances, and
advances it only against a zero-knowledge proof verified on zkVerify. Built
against zkVerify's real interface, with the statement encoding implemented
independently in Solidity and JavaScript and tested to agree.

**But no proof has ever been generated.** `circuits/risk_caps.circom` is real,
reviewable source and it is what the contract is written against — it has not
been compiled, has had no trusted setup, and has never produced a proof. The
honest description is: the integration and security design are built and
tested; the proving system is specified. Compiling it and closing that loop is
the next piece of work.

59 passing tests across both layers.

`docs/RESEARCH_NOTES.md` records what the RFP asks for, what is verified about
the chain, what the confidential layer does and does not establish, and the
known holes in it. Read it before trusting anything here — including, and
especially, the privacy claims.

## Architecture

```
VaultFactory
  └─ deployVault(...) per strategy
       ├─ ShareToken     ERC-20 pro-rata ownership, mint/burn gated to its Vault
       ├─ RiskManager    hardcoded position/exposure/drawdown caps, reverts on breach
       ├─ Vault          deposit/withdraw, NAV accounting, HWM performance fee, swap entrypoint
       └─ StrategyExecutor  onlyTrader entrypoint that calls back into the Vault to trade
```

- **`contracts/Vault.sol`** — holds all vault funds directly, so the trader
  never receives custody. `deposit`/`withdraw` mint and burn `ShareToken`
  pro-rata to NAV. `executeSwap`, callable only by the vault's
  `StrategyExecutor`, routes a trade and then runs the RiskManager's
  post-trade checks. `nav()` prices idle base asset plus any tracked
  non-base asset through Stork. `crystallizePerformanceFee()` mints fee
  shares only for NAV per share above the prior high-water mark. A
  `depositCap` bounds total NAV, and `pause()` halts deposits and trading —
  but never withdrawals, so an emergency switch can never strand a depositor.
- **`contracts/RiskManager.sol`** — `Caps { maxPositionSize, maxSingleAssetBps,
  maxDrawdownBps }`, each enforced as a revert, not a soft warning. This is
  the contract most likely to change shape once positions are confidential:
  enforcing a cap on a hidden position means *proving* the cap held rather
  than checking it in the clear.
- **`contracts/VaultFactory.sol`** — deploys a `ShareToken` + `RiskManager` +
  `Vault` + `StrategyExecutor` as one unit per strategy, so each vault's risk
  caps and trader are isolated. Deployment is gated to the owner plus an
  owner-curated allowlist, and every parameter is bounded: the performance fee
  cannot exceed 30%, basis-point caps cannot exceed 100%, and a zero position
  cap or zero trader address is rejected. Approved operators deploy vaults
  they trade, but the factory owner owns the resulting contracts — so **an
  operator cannot widen their own risk caps or reassign their own trader**.
- **`contracts/interfaces/IStork.sol`** — Horizen's oracle. Read-only by
  design; see the notes on why the update-side ABI is deliberately absent.
- **`contracts/interfaces/IDexRouter.sol`** — the swap venue, kept as a seam
  because **no DEX router is documented on Horizen yet**.

## Network

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `26514` | `2651420` |
| RPC | `https://horizen.calderachain.xyz/http` | `https://horizen-testnet.rpc.caldera.xyz/http` |
| Explorer | `https://explorer.horizen.io/` | `https://explorer-testnet.horizen.io/` |
| Faucet | — | `https://hub-testnet.horizen.io/` |

Gas is paid in **ETH**, not ZEN. Stork's oracle sits at
`0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62` on both networks.

## Development

```bash
npm install
npx hardhat compile
npx hardhat test
```

Solidity 0.8.24, OpenZeppelin Contracts v5, Hardhat 2 + ethers v6 +
Mocha/Chai. `hardhat.config.js` loads the compiler from the locally installed
`solc` package rather than fetching a binary from `binaries.soliditylang.org`,
which some sandboxes block.

`scripts/deploy-local.js` deploys the full mock stack — base asset, WETH,
Stork mock, router mock, factory and one vault — to a local Hardhat node:

```bash
npx hardhat node                                          # separate terminal
npx hardhat run scripts/deploy-local.js --network localhost
```

## Deploying

`scripts/deploy-horizen.js` deploys the factory, and optionally a first vault,
taking every external address from the environment:

```bash
BASE_ASSET_ADDRESS=0x…    # required: the ERC-20 the vault accounts in
ROUTER_ADDRESS=0x…        # optional: omit for a non-trading vault
ORACLE_ADDRESS=0x…        # optional: defaults to Stork's Horizen address
npx hardhat run scripts/deploy-horizen.js --network horizenTestnet
```

`DEPLOYER_PRIVATE_KEY` comes from an untracked local `.env`. A vault holding
only its base asset never calls the router, so `ROUTER_ADDRESS` may be omitted
while no venue exists — the script wires `address(0)` and says so, rather than
pointing at a placeholder.

## What's intentionally not here yet

- **A compiled circuit and a real proof.** The single most important gap.
- **Proof of the transition, not just the destination.** The circuit
  constrains the new state to be within caps; it does not yet prove the state
  was reached by a legitimate trade.
- **A timelock on the verification key.** Changing the circuit changes the
  rules, and today the owner can do it in one transaction.
- **Wiring the confidential layer into `Vault`.** `ConfidentialRiskManager`
  stands alongside the plaintext `RiskManager` rather than replacing it.
- **Strategy ranking and onboarding** beyond the deployer allowlist.
- **A swap venue.** None is documented on Horizen; trading is blocked on it,
  deposits and withdrawals are not.
- **ZEN tokenomics**, including the staking-pool contribution funded projects
  are expected to make.
- **An audit.** Required before the later funding tranches, and not started.
