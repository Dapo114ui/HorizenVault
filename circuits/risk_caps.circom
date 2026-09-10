pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/// Proves that a hidden position set is well-formed and within risk caps.
///
/// STATUS: this circuit is written but NOT COMPILED — no circom toolchain is
/// present in the environment it was authored in, and it has therefore never
/// produced a proof. It is the specification of what the on-chain
/// ConfidentialRiskManager expects, reviewable as source, and it is the next
/// thing to actually run. Do not describe it as working until it has been
/// compiled, had a trusted setup performed, and verified end to end through
/// zkVerify. See docs/RESEARCH_NOTES.md.
///
/// ## The statement
///
/// Public: the vault, a sequence number, the previous and new commitments,
/// the NAV being claimed, the high-water mark, and two caps.
/// Private: the quantity held of each asset in the vault's declared universe,
/// plus a blinding factor.
///
/// The proof establishes four things:
///
///   1. The new quantities open the new commitment — so the vault cannot
///      commit to one position set and prove properties of another.
///   2. Those quantities, at the given prices, sum to exactly the NAV being
///      published — so the performance record is honest. This is the
///      attestation half: depositors verify returns without seeing holdings.
///   3. No single position exceeds maxPositionSize.
///   4. No single position exceeds maxSingleAssetBps of NAV.
///
/// ## What it deliberately does not prove
///
/// The drawdown cap. It is a relation between NAV and the high-water mark,
/// both public, so the contract checks it directly — proving it here would
/// cost constraints and reveal nothing new.
///
/// The *previous* commitment's opening. This circuit constrains the new state
/// only; `prevCommitment` is bound into the public inputs so a proof cannot be
/// lifted onto a different starting state, but the transition itself is not
/// proven to be a valid trade. That is a real limitation: it means the
/// operator can move to any within-caps state rather than only to states
/// reachable by trading. Closing it requires proving conservation across the
/// swap (quantities in, quantities out, at execution prices) and roughly
/// doubles the circuit. It is the obvious second iteration.
///
/// ## Privacy boundary
///
/// The asset universe is public — an observer learns which assets the vault
/// may hold, and the price vector is public because it comes from the oracle.
/// What is hidden is the allocation: how much of each, including zero. Since
/// a quantity of zero is indistinguishable from any other hidden quantity,
/// "which of these assets is it actually in" stays private, which is the part
/// that leaks a strategy.

template RiskCaps(N, VALUE_BITS) {
    // --- public ---
    signal input vault;
    signal input sequence;
    signal input prevCommitment;
    signal input newCommitment;
    signal input nav;
    signal input highWaterMark;
    signal input maxPositionSize;
    signal input maxSingleAssetBps;

    // Prices are public: they come from the Stork feed the vault already
    // reads on-chain, so treating them as secret would be theatre.
    signal input prices[N];

    // --- private ---
    signal input quantities[N];
    signal input blinding;

    // `vault`, `sequence`, `prevCommitment` and `highWaterMark` are not
    // constrained by any relation below — they are bound into the statement
    // purely so that a valid proof is tied to one vault, one transition, and
    // one starting state. Without these lines the compiler would optimise the
    // unused signals away and they would silently stop being part of the
    // statement, which would reopen exactly the replay holes the on-chain
    // sequence number exists to close.
    signal vaultBound <== vault * 1;
    signal sequenceBound <== sequence * 1;
    signal prevBound <== prevCommitment * 1;
    signal hwmBound <== highWaterMark * 1;

    // 1. The commitment opens to these quantities.
    component commitment = Poseidon(N + 1);
    for (var i = 0; i < N; i++) {
        commitment.inputs[i] <== quantities[i];
    }
    commitment.inputs[N] <== blinding;
    commitment.out === newCommitment;

    // 2. Position values, and their sum, equal the published NAV.
    signal values[N];
    signal running[N + 1];
    running[0] <== 0;
    for (var i = 0; i < N; i++) {
        values[i] <== quantities[i] * prices[i];
        running[i + 1] <== running[i] + values[i];
    }
    running[N] === nav;

    // 3. No position above the absolute cap.
    component withinPositionCap[N];
    for (var i = 0; i < N; i++) {
        withinPositionCap[i] = LessEqThan(VALUE_BITS);
        withinPositionCap[i].in[0] <== values[i];
        withinPositionCap[i].in[1] <== maxPositionSize;
        withinPositionCap[i].out === 1;
    }

    // 4. No position above its share of NAV.
    //    value * 10000 <= maxSingleAssetBps * nav, avoiding division.
    signal navShareCeiling <== maxSingleAssetBps * nav;
    signal scaledValue[N];
    component withinExposureCap[N];
    for (var i = 0; i < N; i++) {
        scaledValue[i] <== values[i] * 10000;
        withinExposureCap[i] = LessEqThan(VALUE_BITS);
        withinExposureCap[i].in[0] <== scaledValue[i];
        withinExposureCap[i].in[1] <== navShareCeiling;
        withinExposureCap[i].out === 1;
    }
}

// N = 8 assets in the universe.
//
// VALUE_BITS = 200 must exceed the widest quantity compared above, which is
// value * 10000 — for an 18-decimal asset at an 18-decimal price that is
// already ~10^40, so the bound is generous on purpose. It must also stay
// below the field size, since LessEqThan is only meaningful for inputs that
// do not wrap: a comparison on a wrapped value silently returns the wrong
// answer rather than failing, which would turn a breached cap into a
// satisfied one.
component main {
    public [
        vault,
        sequence,
        prevCommitment,
        newCommitment,
        nav,
        highWaterMark,
        maxPositionSize,
        maxSingleAssetBps,
        prices
    ]
} = RiskCaps(8, 200);
