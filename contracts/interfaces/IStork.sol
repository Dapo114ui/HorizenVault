// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read interface for Stork, the primary oracle integration on
/// Horizen Chain. Deployed at 0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62 on
/// both Horizen mainnet and testnet.
///
/// Stork is a **pull** oracle, which is the significant difference from a
/// conventional push feed: no price sits on-chain until somebody pays to put
/// it there. The flow is that an off-chain caller fetches a signed payload
/// from Stork's REST API, submits it to the Stork contract (paying the fee
/// quoted by `getUpdateFeeV1`), and only then can a contract read the value
/// back. Anyone may perform that update -- it is not privileged -- so this
/// vault deliberately depends on the *read* side alone and never writes.
///
/// The consequence for callers: a price this vault reads is only as fresh as
/// the last person who pushed it. `maxOracleAge` on the Vault is what turns
/// that from a silent risk into a revert. Refreshing before a deposit,
/// withdrawal or trade is the responsibility of the frontend or a keeper --
/// see docs/RESEARCH_NOTES.md, "The pull-oracle problem".
///
/// The update-side ABI (`updateTemporalNumericValuesV1`) is deliberately
/// **not** declared here. Its `TemporalNumericValueInput` struct is not
/// specified in Horizen's documentation, and guessing at a struct layout
/// produces a contract that compiles and then fails against the real
/// deployment. Confirm it against Stork's own EVM contract API before
/// writing any code that pushes prices.
interface IStork {
    struct TemporalNumericValue {
        /// @dev Nanosecond-precision Unix timestamp. Note the unit: dividing
        /// by 1e9 to reach seconds is required before comparing against
        /// `block.timestamp`.
        uint64 timestampNs;
        /// @dev Price scaled to 18 decimals. Signed, because Stork feeds are
        /// general-purpose numeric values and not all of them are prices.
        int192 quantizedValue;
    }

    /// @notice Reads a feed, reverting with `StaleValue` if the stored value
    /// is older than the chain's configured freshness threshold.
    function getTemporalNumericValueV1(bytes32 id)
        external
        view
        returns (TemporalNumericValue memory value);

    /// @notice Reads a feed without the built-in staleness revert, leaving
    /// the freshness policy to the caller. This vault uses this variant so
    /// that its own `maxOracleAge` is the single staleness rule in force,
    /// rather than layering a second, chain-configured one underneath it
    /// that could change without notice.
    function getTemporalNumericValueUnsafeV1(bytes32 id)
        external
        view
        returns (TemporalNumericValue memory value);
}
