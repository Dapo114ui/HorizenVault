# Research notes

What was verified against primary sources, what is still assumed, and the
decisions that follow from each. Everything here was read on 9–10 September
2026 from Horizen's own documentation (`github.com/HorizenOfficial/horizen-docs`)
and the Builder Fund pages at `horizen.io/builder-fund`.

## The grant this is scoped for

**Horizen Builder Fund Season 2, Category 1 (core apps / RFPs)** — up to
**$150,000 per project**, denominated in USD and settled in USDC. Horizen
published an RFP on 27 August 2026 naming two components it wants added to
its private-finance app cluster. One is this:

> Horizen is seeking a private vault protocol where automated strategies —
> proprietary quantitative models, rules-based systems, or AI-driven agents —
> trade on behalf of depositors without exposing positions, holdings, or
> strategy logic onchain.

The reasoning is the same one that motivates this repository:

> Public vaults leak their edge: strategies are copied, entries are
> front-run, and large positions invite adversarial trading against them,
> which caps the sophistication of what anyone is willing to run onchain.

Four things are being asked for, and this repository currently addresses one:

| Requirement | State here |
|---|---|
| Vault mechanics — pooled deposits, pro-rata shares, non-custodial execution, risk caps | Built and tested |
| Confidential execution — positions, holdings and strategy logic hidden | **Not started** |
| Verifiable performance attestation — prove returns without revealing positions | **Not started** |
| Strategy supply — sourcing, onboarding, ranking, protocol fees | Partial: per-strategy isolation and a curated deployer allowlist exist; ranking does not |

Funding is tranched: 10% at approval, 20% on a first milestone rooted in the
core privacy capability, then the remainder across a completed security audit
(sized to real quotes, half paid pre-audit) and demonstrated mainnet usage.
Two elements are explicitly non-negotiable — proving privacy capability early,
and real usage before the final tranche. Deadlines are proposed by the
applicant and negotiated.

Funded projects contribute to the ZEN staking rewards pool; current
participants generally contribute **15–20% of protocol fees**. That is a
standing business term, not a one-off, and belongs in any fee model.

## Network parameters

From Horizen's own documentation, not a third-party chain list.

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `26514` | `2651420` |
| RPC | `https://horizen.calderachain.xyz/http` | `https://horizen-testnet.rpc.caldera.xyz/http` |
| WebSocket | `wss://horizen.calderachain.xyz/ws` | `wss://horizen-testnet.rpc.caldera.xyz/ws` |
| Explorer | `https://explorer.horizen.io/` | `https://explorer-testnet.horizen.io/` |
| Faucet | — | `https://hub-testnet.horizen.io/` |

Horizen is an OP Stack L3 settling on Base, which settles on Ethereum. The
execution engine is near-vanilla EVM, so ordinary Solidity tooling applies —
`hardhat.config.js` here needs no Horizen-specific plugin.

**Gas is paid in ETH.** There is no separate gas token and ZEN is not one;
ZEN is an ERC-20 with a LayerZero OFT representation on Horizen.

Candidate base assets:

| Asset | Horizen mainnet |
|---|---|
| USDC.e | `0xDF7108f8B10F9b9eC1aba01CCa057268cbf86B6c` |
| cbBTC (OFT) | `0x68fb5BB8330C0b9d907F50f278143873276ee056` |
| ZEN (OFT) | `0x57da2D504bf8b83Ef304759d9f2648522D7a9280` |

Note the documentation lists **no USDC on testnet** — only tZEN
(`0xb06EC4ce262D8dbDc24Fac87479A49A7DC4cFb87`) and testnet cbBTC
(`0x06DA6bDD2aB23447af5162ab0975edDA7E8d3747`). A testnet deployment
therefore either accounts in one of those or in a purpose-deployed mock
ERC-20. This is worth settling before the first deployment, because the base
asset is fixed at construction.

## The oracle is Stork, and it changed the design

`0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62` — the same address on mainnet and
testnet.

Stork replaces DIA from the X1 lineage, and it is not a drop-in. The
mechanical differences are handled in `contracts/interfaces/IStork.sol` and
`Vault._valueInBase`:

- Prices are **18-decimal**, not DIA's `1e8`. `ORACLE_SCALE` changed accordingly.
- Values are **signed** (`int192`) because Stork feeds are general-purpose
  numerics. A value at or below zero is rejected as "no price" rather than
  cast into an enormous unsigned NAV.
- Timestamps are **nanoseconds** (`timestampNs`), not seconds. Comparing them
  against `block.timestamp` without dividing by `1e9` would make every price
  look fresh forever — a silent failure, which is why `MockStork` stores
  nanoseconds too rather than being kinder than reality.
- Feed identifiers are `bytes32`, not DIA's string keys.

### The pull-oracle problem

The architectural difference matters more than any of the above. **Stork is a
pull oracle**: no price exists on-chain until somebody fetches a signed
payload from Stork's REST API and pays to submit it. A push feed updates
whether or not you are watching; Stork does not.

For this vault that means `nav()` reads whatever price was last pushed by
anyone, which may be hours old. `maxOracleAge` is the only thing standing
between a stale feed and mispriced mints and burns, so it stops being a
belt-and-braces guard and becomes load-bearing.

What is **not** resolved: who refreshes the price, and when. Options, none
committed to yet:

1. A keeper that pushes before each interaction. Simple, but adds an
   off-chain dependency and a liveness assumption to deposits.
2. A payable vault entrypoint that refreshes and then acts atomically. Best
   for correctness, but requires the update-side ABI.
3. Push on trade only, and accept a bounded staleness window for
   deposits/withdrawals via `maxOracleAge`.

The update-side ABI is deliberately **not declared** in `IStork.sol`.
Horizen's documentation names `updateTemporalNumericValuesV1` and
`getUpdateFeeV1` but does not specify the `TemporalNumericValueInput` struct,
and guessing a struct layout yields a contract that compiles and then fails
against the real deployment. Confirm it against Stork's own EVM contract API
first. This vault reads only, so nothing here is blocked on it.

## There is no exchange to trade on

Grepping the entirety of Horizen's documentation turns up **no DEX router** —
no Uniswap or Aerodrome deployment, no address for ZENDEX or DarkSwap. The
private DEX intended for the app cluster is itself still an open RFP.

`IDexRouter` is therefore an assumed Uniswap-V2-style surface, kept as a seam
rather than a dependency: a vault deployed with the zero address for its
router simply never trades, and deposits, withdrawals and NAV accounting all
work without it.

**This is on the critical path, not deferrable.** On X1 a deposit-only v1 was
a reasonable first deployment. Here it is not: the RFP's guidepost metrics are
cumulative execution volume routed by vaults, active strategies with external
depositors, unique depositors, total value deposited and protocol fee revenue.
A vault that cannot trade scores zero on all of them, and the final funding
tranche is gated on demonstrated usage.

## Privacy primitives available

Horizen offers two, and mandates neither — the Builder Fund page says they
favour teams using them "though this is not a hard requirement," and the RFP
says "privacy architecture and other specifics are yours to propose."

**Vela** — TEE-based confidential execution by Horizen Labs. Application logic
runs inside hardware enclaves; every computation emits an attestation proving
it ran correctly without revealing the data. Exactly the shape this RFP
describes. But per Horizen's own limitations page it is **closed beta**:

- Not deployed to any testnet or mainnet; local Docker only
- The local TEE is **emulated** — no hardware attestation guarantees
- One WASM application per environment
- **ERC-20 support is still roadmap**, which a vault needs

There is an escape hatch: a working prototype can request a dedicated AWS
Nitro Enclave instance by contacting the team. Category 1 also comes with
"direct coordination with the Foundation," so this is likelier to be open to a
funded core-app team than to the public.

**zkVerify** — a separate L1 that verifies ZK proofs generated off-chain and
returns results consumable by Horizen contracts, with no custom verifier
contract to deploy or maintain. Live, and independent of Vela.

Also available: **PureFi** for synchronous AML gating (verify-or-revert before
business logic runs), and ordinary Solidity access-control patterns, which
Horizen's compliance documentation treats as a legitimate first option.

### Where the confidentiality layer lands

Nothing here is built yet. The design the RFP points at — "confidential
execution paired with verifiable performance attestation" — maps onto the two
primitives directly: Vela for hiding positions and strategy logic during
execution, zkVerify for proving the resulting numbers honest.

One existing piece gets more interesting rather than less under that design.
`RiskManager` currently enforces caps by reverting on plaintext values. Once
positions are confidential, cap enforcement becomes *proving* that the
post-trade state satisfied the caps without publishing the state — a
verifiable guarantee to depositors who cannot see inside the vault. That is a
direct evolution of code that already exists and is tested here.

## What carried over unchanged, and what did not

Ported from the X1 vault without modification: `ShareToken`, `RiskManager`,
`StrategyExecutor`, `IVault`, and the whole of `Vault`'s accounting —
pro-rata deposits and withdrawals, NAV, the high-water-mark performance fee,
mixed-decimal handling, the deposit cap and the pause behaviour. The factory's
per-strategy isolation, deployer allowlist and parameter bounds carried over
too, as did all 40 tests.

Replaced: the DIA oracle (→ Stork), the Ecodex router (→ `IDexRouter`), the
network configuration, and the deployment script.

## Open questions

- **Base asset for testnet**, given no USDC is documented there.
- **Who refreshes Stork prices**, per the pull-oracle problem above.
- **Which venue trades route through**, and its real ABI.
- **Stork's update-side struct layout**, before any price-pushing code.
- **The privacy architecture itself** — the substantive design decision, and
  the one the grant is actually funding.
