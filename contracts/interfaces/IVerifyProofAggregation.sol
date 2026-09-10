// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice zkVerify's proof-aggregation entrypoint.
///
/// zkVerify is a separate L1 that verifies zero-knowledge proofs and
/// aggregates them into Merkle trees. A proof is submitted there, off this
/// chain; what arrives here is the claim that a particular statement was
/// among the leaves of an aggregation whose root zkVerify has published. So
/// an EVM contract never verifies a proof itself and deploys no verifier —
/// it asks whether a leaf is in a published aggregation.
///
/// The signature below mirrors zkVerify's own
/// `IVerifyProofAggregation` (Apache-2.0,
/// github.com/zkVerify/zkv-attestation-contracts) and is restated here only
/// because their file pins `pragma solidity 0.8.20` exactly, which will not
/// compile alongside this project's 0.8.24. Keep it in step with theirs.
interface IVerifyProofAggregation {
    function verifyProofAggregation(
        uint256 _domainId,
        uint256 _aggregationId,
        bytes32 _leaf,
        bytes32[] calldata _merklePath,
        uint256 _leafCount,
        uint256 _index
    ) external view returns (bool);
}
