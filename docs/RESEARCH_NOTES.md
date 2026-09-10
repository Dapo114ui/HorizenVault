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

---

# The confidential layer

First iteration, added after the foundation. This section is the honest
account of what has been built, what has merely been specified, and where the
holes are. Read it before describing this work to anyone.

## The idea

The plaintext `RiskManager` enforces caps by reading balances and reverting.
That is exactly why a public vault is safe — and exactly why it leaks: the
values that let the contract check a cap let everyone else reconstruct the
strategy.

`ConfidentialRiskManager` replaces the reading with proving. The vault
publishes a Poseidon commitment to its position quantities instead of the
quantities. To move that commitment, the strategy presents a zero-knowledge
proof — verified on zkVerify, not here — that the new positions open the new
commitment, value to the NAV being published, and satisfy the caps.

Depositors keep the guarantee they had (caps held, NAV honest) and lose the
visibility that made the vault copyable.

### The public/private split

Public: caps, NAV, high-water mark, oracle prices, and the set of assets the
vault *may* hold. Private: how much of each it actually holds.

This split is forced by the RFP, and it is the right one. Depositors cannot
allocate on a track record they cannot see, so performance must stay public
and provable — that is the "verifiable performance attestation" half. What
must be hidden is the allocation, because that is the copyable part.

Note what this does **not** hide: the asset universe. An observer learns which
assets a vault is permitted to trade. It does hide which of them it is
actually in, since a zero quantity is indistinguishable from any other hidden
quantity. Hiding the universe as well needs a different commitment scheme.

## What is actually built and tested

- **The on-chain integration, against zkVerify's real ABI.** Their
  `zkv-attestation-contracts` repository is public; the interface and
  statement-hash format here were taken from it rather than guessed. zkVerify
  aggregates verified proofs into Merkle trees, so an EVM contract deploys no
  verifier — it asks whether a leaf is in a published aggregation.
- **The commitment scheme.** Real Poseidon, over BN254, blinded. Tested that
  every position slot binds and that equal books under different blindings
  produce different commitments.
- **The statement encoding, implemented twice.** Once in Solidity, once in
  `lib/statement.js`, with a test asserting they agree word for word. A
  divergence here would show up only as a correct proof mysteriously failing
  to verify, with nothing to indicate which side was wrong.
- **The replay and binding design.** Commitment chaining alone is not enough:
  a vault that trades back into an earlier position reproduces an earlier
  commitment, and the original proof for that transition would verify again.
  A sequence number in the public inputs closes it, and there is a test that
  walks A→B→A and confirms the first proof no longer works. The vault address
  and the caps are bound in too, so a proof cannot be lifted from another
  vault or minted under looser caps and spent under tighter ones.
- **Prices bound to the oracle by structure.** `advanceState` is
  `onlyVault`, because the vault is the contract that reads Stork. An open
  entrypoint would let a caller supply invented prices, make any position set
  value to any NAV, and render the attestation worthless.

19 tests, on top of the 59 covering the plaintext vault.

## The circuit compiles, proves, and refuses what it should

Built with circom 2.2.3, compiled from source. The numbers:

| | |
|---|---|
| Non-linear constraints | 3,645 |
| Linear constraints | 891 |
| Public inputs | 16 |
| Private inputs | 9 (8 quantities + blinding) |
| Proving time | ~570ms |

Three things this establishes that the design alone did not:

1. **The public-input vector matches.** The circuit emits 16 public signals
   and `scripts/prove.js` asserts they equal `publicInputs()` element for
   element. That alignment was previously an intention; it is now checked.
2. **Proving is fast enough to be usable.** Sub-second proof generation means
   proving cost does not bound how often a strategy can trade, which was an
   open viability question and could have sunk the whole approach.
3. **The caps are genuinely constrained.** A circuit that proves anything
   looks identical from outside to one that constrains properly, so the script
   also attempts to prove a book that breaches the position cap and confirms
   witness generation fails. Without this check the confidentiality would be
   theatre.

### What still has not happened

- **No proof has gone through zkVerify.** Everything above verifies locally
  with snarkjs. The on-chain path — register the verification key with
  zkVerify, submit a proof, have it aggregated, consume the attestation
  through `advanceState` — is untested end to end, and the `vkHash` zkVerify
  derives from a registered key is not necessarily the placeholder used here.
- **The trusted setup is development-only.** `scripts/setup-circuit.sh`
  generates the toxic waste locally and destroys nothing, so whoever ran it
  can forge proofs against that key. Fine for a demonstration, disqualifying
  for a vault holding deposits. Production needs a multi-party ceremony and a
  Phase 1 taken from an existing public powers-of-tau file.

## Known holes

1. **The circuit proves the destination, not the journey.** It constrains the
   new state to be well-formed and within caps. It does not prove the
   transition was a legitimate trade, so an operator could move to any
   within-caps state rather than only to states reachable by trading. Closing
   this means proving conservation across the swap — quantities in, quantities
   out, at execution prices — and roughly doubles the circuit. It is the
   obvious second iteration and it should not ship without it.
2. **`vkHash` is owner-settable.** Changing the circuit changes the rules, and
   an owner who swaps in a permissive circuit can authorise anything. It is
   evented, but eventing is not protection. This wants a timelock at minimum.
3. **The mock does not verify Merkle paths.** Deliberate — a mock that faked
   aggregation would test this contract's arithmetic rather than the vault's
   behaviour, and would drift from zkVerify's real tree. But it means the
   Merkle-path plumbing is untested until it runs against the real thing.
4. **Proving cost is measured but not stress-tested.** ~570ms for the current
   8-asset universe on one machine. A larger universe, a wider comparator, or
   the conservation constraints of the next iteration all grow it, and none of
   that has been measured.
5. **The blinding factor must be freshly random per commitment.** Quantities
   are drawn from a small, guessable space, so an unblinded or reused-blinding
   commitment is brute-forceable. Nothing in the contract can enforce this —
   it is a property of the prover, and it is the kind of thing that gets
   quietly wrong.

## Next

Take a proof through zkVerify itself: register the verification key, submit a
proof, let it be aggregated, and consume the resulting attestation through
`advanceState` on a real network. Local verification proves the circuit is
sound; only that round trip proves the integration is.

That is the shape of the Builder Fund's M1 — "a meaningful technical milestone
rooted in your core privacy capability" — and most of it now exists.
