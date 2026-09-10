// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IVerifyProofAggregation.sol";

/// @title ConfidentialRiskManager
/// @notice Enforces risk caps on a position set nobody can see.
///
/// The plaintext `RiskManager` checks caps by reading balances and reverting.
/// That works and it is why a public vault is safe -- and it is also why a
/// public vault leaks: the same values that let the contract check a cap let
/// everyone else reconstruct the strategy.
///
/// Here the vault publishes only a *commitment* to its positions. To advance
/// that commitment the strategy must present a zero-knowledge proof,
/// verified on zkVerify, that the new positions open the new commitment, that
/// they value to the NAV being reported, and that they satisfy the caps. So
/// depositors get the same guarantee they had before -- caps held, NAV is
/// honest -- while the allocation behind it stays private.
///
/// ## The public/private split
///
/// Public: the caps, the NAV, the high-water mark, the price feed values, and
/// the set of assets the vault *may* hold. Private: how much of each it
/// actually holds.
///
/// That split is deliberate. Depositors cannot allocate on a track record
/// they cannot see, so NAV and performance must stay public and provable --
/// that is the "verifiable performance attestation" half of the problem. What
/// has to be hidden is the allocation, because that is the copyable part.
///
/// **This model hides sizes and allocation, not the asset universe.** An
/// observer learns which assets a vault is permitted to trade. Hiding the
/// universe too is possible but needs a different commitment scheme; see
/// docs/RESEARCH_NOTES.md before assuming this version does it.
///
/// ## What is enforced where
///
/// The drawdown cap is checked here in the clear, not in the circuit,
/// because it is a statement about NAV and the high-water mark and both are
/// already public. Proving in zero knowledge what anyone can check by
/// reading two public numbers costs constraints and buys nothing. Only the
/// per-position and per-asset exposure caps -- which are statements about
/// hidden quantities -- go into the proof.
contract ConfidentialRiskManager is Ownable {
    /// @dev Mirrors the plaintext RiskManager's caps so the two are
    /// comparable. Public by design: depositors must be able to read the
    /// rules even when they cannot read the positions.
    struct Caps {
        uint256 maxPositionSize;
        uint256 maxSingleAssetBps;
        uint256 maxDrawdownBps;
    }

    /// @dev Where zkVerify recorded the proof. Grouped rather than passed as
    /// five loose arguments because these travel together, are meaningless
    /// apart, and are opaque to this contract -- it forwards them without
    /// interpreting any of them.
    struct Attestation {
        uint256 domainId;
        uint256 aggregationId;
        bytes32[] merklePath;
        uint256 leafCount;
        uint256 index;
    }

    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice Assets in the vault's declared universe. Fixed, because a
    /// circuit is compiled for one size -- changing it means a new circuit and
    /// a new verification key, not a setter. Must equal the circuit's N.
    uint256 public constant UNIVERSE_SIZE = 8;

    /// @dev zkVerify's statement-hash format. PROVING_SYSTEM_ID and the
    /// empty-version hash are fixed by their protocol, not chosen here.
    bytes32 private constant PROVING_SYSTEM_ID = keccak256(abi.encodePacked("groth16"));
    bytes32 private constant NO_VERSION_HASH = sha256(abi.encodePacked(""));

    IVerifyProofAggregation public immutable zkVerify;

    /// @notice The vault these proofs are about. A public input, so a proof
    /// minted for one vault cannot be replayed against another that happens
    /// to run the same circuit under the same caps.
    address public immutable vault;

    Caps public caps;

    /// @notice Poseidon commitment to the current position quantities.
    /// A field element, not a hash digest -- it is consumed as a circuit
    /// public input, so it must live below the BN254 scalar modulus.
    uint256 public stateCommitment;

    /// @notice Monotonic counter, included as a public input.
    ///
    /// Commitment chaining alone does not prevent replay: a vault that trades
    /// back into an earlier position reproduces an earlier commitment, and
    /// the old proof for that transition would verify again. The sequence
    /// number makes every transition's public inputs unique regardless of
    /// what the positions do.
    uint256 public sequence;

    /// @notice Verification-key hash of the circuit currently accepted.
    /// Mutable because the circuit will change; changing it is equivalent to
    /// changing the rules, so it is owner-only and loudly evented.
    bytes32 public vkHash;

    /// @notice Last NAV proven, in base-asset units. This is the attested
    /// performance record -- honest by construction, since a proof that
    /// advanced the commitment had to show the hidden positions sum to it.
    uint256 public attestedNav;

    event StateAdvanced(
        uint256 indexed sequence,
        uint256 previousCommitment,
        uint256 newCommitment,
        uint256 nav
    );
    event VerificationKeyUpdated(bytes32 previousVkHash, bytes32 newVkHash);
    event CapsUpdated(uint256 maxPositionSize, uint256 maxSingleAssetBps, uint256 maxDrawdownBps);

    error OnlyVault(address caller);
    error PriceVectorLength(uint256 got, uint256 expected);
    error ProofRejected();
    error DrawdownExceeded(uint256 nav, uint256 floor);
    error CommitmentUnchanged();
    error VerificationKeyUnset();
    error NotAFieldElement(uint256 value);
    error BpsOutOfRange(uint256 bps);

    /// @dev BN254 scalar field modulus. Circuit public inputs are field
    /// elements; anything at or above this wraps when the proof system reads
    /// it, so a commitment above the modulus would verify against a
    /// *different* value than the one stored here. Reject it at the door.
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @dev Only the vault may advance the state. This is what binds the
    /// price vector to reality: the vault is the contract that reads Stork,
    /// so prices reaching the proof are oracle-read values rather than
    /// numbers the prover picked. An unrestricted entrypoint here would let a
    /// caller supply invented prices, make any position set value to any NAV,
    /// and render the performance attestation meaningless.
    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault(msg.sender);
        _;
    }

    constructor(
        address owner_,
        IVerifyProofAggregation zkVerify_,
        address vault_,
        Caps memory caps_,
        uint256 initialCommitment,
        bytes32 vkHash_
    ) Ownable(owner_) {
        if (caps_.maxSingleAssetBps > BPS_DENOMINATOR) revert BpsOutOfRange(caps_.maxSingleAssetBps);
        if (caps_.maxDrawdownBps > BPS_DENOMINATOR) revert BpsOutOfRange(caps_.maxDrawdownBps);
        if (initialCommitment >= FIELD_MODULUS) revert NotAFieldElement(initialCommitment);

        zkVerify = zkVerify_;
        vault = vault_;
        caps = caps_;
        stateCommitment = initialCommitment;
        vkHash = vkHash_;
    }

    // --- admin ---

    function setVerificationKey(bytes32 newVkHash) external onlyOwner {
        emit VerificationKeyUpdated(vkHash, newVkHash);
        vkHash = newVkHash;
    }

    function setCaps(Caps calldata newCaps) external onlyOwner {
        if (newCaps.maxSingleAssetBps > BPS_DENOMINATOR) revert BpsOutOfRange(newCaps.maxSingleAssetBps);
        if (newCaps.maxDrawdownBps > BPS_DENOMINATOR) revert BpsOutOfRange(newCaps.maxDrawdownBps);
        caps = newCaps;
        emit CapsUpdated(newCaps.maxPositionSize, newCaps.maxSingleAssetBps, newCaps.maxDrawdownBps);
    }

    // --- state transition ---

    /// @notice Advance the committed position state, given a proof that the
    /// new state is well-formed and within caps.
    ///
    /// @param newCommitment Poseidon commitment to the new quantities.
    /// @param nav           NAV the new positions value to, in base units.
    /// @param highWaterMark High-water mark the drawdown cap is measured from.
    /// @param prices        Oracle-read price for each asset in the universe,
    ///                      in the circuit's declared order. Public inputs, so
    ///                      the proof is bound to the prices the vault saw.
    /// @param att           Where zkVerify aggregated this proof.
    function advanceState(
        uint256 newCommitment,
        uint256 nav,
        uint256 highWaterMark,
        uint256[] calldata prices,
        Attestation calldata att
    ) external onlyVault {
        if (vkHash == bytes32(0)) revert VerificationKeyUnset();
        if (prices.length != UNIVERSE_SIZE) revert PriceVectorLength(prices.length, UNIVERSE_SIZE);
        if (newCommitment >= FIELD_MODULUS) revert NotAFieldElement(newCommitment);
        // A no-op transition would burn a sequence number and emit a
        // misleading event; a real trade always moves the commitment.
        if (newCommitment == stateCommitment) revert CommitmentUnchanged();

        // Drawdown is a statement about two public numbers, so it is checked
        // here rather than proven. Enforced before the proof call so a
        // breaching transition costs the caller less to discover.
        uint256 floor = (highWaterMark * (BPS_DENOMINATOR - caps.maxDrawdownBps)) / BPS_DENOMINATOR;
        if (nav < floor) revert DrawdownExceeded(nav, floor);

        uint256[] memory inputs = publicInputs(newCommitment, nav, highWaterMark, prices);
        bytes32 leaf = statementHash(vkHash, inputs);

        if (
            !zkVerify.verifyProofAggregation(
                att.domainId, att.aggregationId, leaf, att.merklePath, att.leafCount, att.index
            )
        ) {
            revert ProofRejected();
        }

        uint256 previous = stateCommitment;
        stateCommitment = newCommitment;
        attestedNav = nav;
        unchecked {
            sequence += 1;
        }
        emit StateAdvanced(sequence, previous, newCommitment, nav);
    }

    /// @notice The circuit's public inputs, in the order the circuit declares
    /// them. Exposed as a view so the off-chain prover can build the identical
    /// vector rather than duplicating the ordering by hand -- a mismatch here
    /// is invisible until a valid proof mysteriously fails to verify.
    ///
    /// `sequence` is the *current* value, i.e. the one being consumed by this
    /// transition, not the value after it.
    function publicInputs(
        uint256 newCommitment,
        uint256 nav,
        uint256 highWaterMark,
        uint256[] memory prices
    ) public view returns (uint256[] memory inputs) {
        inputs = new uint256[](8 + UNIVERSE_SIZE);
        inputs[0] = uint256(uint160(vault));
        inputs[1] = sequence;
        inputs[2] = stateCommitment;
        inputs[3] = newCommitment;
        inputs[4] = nav;
        inputs[5] = highWaterMark;
        inputs[6] = caps.maxPositionSize;
        inputs[7] = caps.maxSingleAssetBps;
        for (uint256 i = 0; i < UNIVERSE_SIZE; i++) {
            inputs[8 + i] = prices[i];
        }
    }

    // --- zkVerify statement encoding ---

    /// @notice The leaf zkVerify would have recorded for this statement.
    /// Format is defined by zkVerify, not by this protocol.
    function statementHash(bytes32 vkHash_, uint256[] memory inputs) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                PROVING_SYSTEM_ID,
                vkHash_,
                NO_VERSION_HASH,
                keccak256(encodePublicInputs(inputs))
            )
        );
    }

    /// @notice Public inputs encoded as zkVerify expects them: each field
    /// element as 32 little-endian bytes, concatenated. The EVM is big-endian
    /// throughout, so each word is byte-reversed here.
    function encodePublicInputs(uint256[] memory inputs) public pure returns (bytes memory) {
        bytes32[] memory encoded = new bytes32[](inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            encoded[i] = _reverseBytes(inputs[i]);
        }
        return abi.encodePacked(encoded);
    }

    /// @dev Reverses the byte order of a 32-byte word by swapping
    /// progressively wider adjacent groups: bytes, then 2-byte pairs, 4, 8,
    /// and finally the two halves.
    function _reverseBytes(uint256 input) internal pure returns (bytes32) {
        uint256 v = input;
        v = ((v & 0xFF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00) >> 8)
            | ((v & 0x00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF) << 8);
        v = ((v & 0xFFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000) >> 16)
            | ((v & 0x0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF) << 16);
        v = ((v & 0xFFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000) >> 32)
            | ((v & 0x00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF) << 32);
        v = ((v & 0xFFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF0000000000000000) >> 64)
            | ((v & 0x0000000000000000FFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF) << 64);
        v = (v >> 128) | (v << 128);
        return bytes32(v);
    }
}
