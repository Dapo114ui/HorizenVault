// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVerifyProofAggregation.sol";

/// @notice Test-only stand-in for zkVerify's aggregation contract, modelled
/// on the mock zkVerify ships in `zkv-attestation-contracts`.
///
/// It answers `true` only for a leaf that has been explicitly accepted, and
/// `false` for everything else. That is the property the tests care about:
/// the vault must advance its state for a statement zkVerify vouched for and
/// refuse every other one -- including a statement that differs only in a
/// public input, which is exactly how replay and cross-vault reuse are meant
/// to fail.
///
/// It does **not** check Merkle paths. A mock that faked aggregation would be
/// a worse test, not a better one: it would assert things about this
/// contract's own arithmetic rather than about the vault's behaviour, and it
/// would silently diverge from zkVerify's real tree the moment either
/// changed.
contract MockProofAggregation is IVerifyProofAggregation {
    mapping(bytes32 => bool) public accepted;

    /// @notice Mark a leaf as one zkVerify has aggregated.
    function accept(bytes32 leaf) external {
        accepted[leaf] = true;
    }

    /// @notice Withdraw acceptance, so a test can assert the failure path.
    function reject(bytes32 leaf) external {
        accepted[leaf] = false;
    }

    function verifyProofAggregation(
        uint256, /* domainId */
        uint256, /* aggregationId */
        bytes32 _leaf,
        bytes32[] calldata, /* merklePath */
        uint256, /* leafCount */
        uint256 /* index */
    ) external view returns (bool) {
        return accepted[_leaf];
    }
}
