// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IStork.sol";

/// @notice Test-only stand-in for Stork's price feed. Prices are set
/// directly rather than pushed as signed payloads, so vault tests can
/// exercise NAV, exposure and staleness behaviour without reproducing
/// Stork's off-chain signing flow.
///
/// Setters take seconds and store the nanosecond precision the real contract
/// reports, so a test that gets the unit wrong fails here rather than
/// silently passing against a mock that is kinder than reality.
contract MockStork is IStork {
    mapping(bytes32 => TemporalNumericValue) private values;

    /// @param price 18-decimal USD price, matching Stork's quantized scale.
    function setPrice(bytes32 id, int192 price) external {
        values[id] = TemporalNumericValue({
            timestampNs: uint64(block.timestamp) * 1e9,
            quantizedValue: price
        });
    }

    /// @param updatedAtSeconds Unix seconds; stored as nanoseconds.
    function setPriceAt(bytes32 id, int192 price, uint64 updatedAtSeconds) external {
        values[id] = TemporalNumericValue({
            timestampNs: updatedAtSeconds * 1e9,
            quantizedValue: price
        });
    }

    function getTemporalNumericValueUnsafeV1(bytes32 id)
        external
        view
        returns (TemporalNumericValue memory)
    {
        return values[id];
    }

    /// @dev Mirrors the real contract's staleness revert. The vault reads the
    /// `Unsafe` variant, so this exists to keep the mock honest to the
    /// interface rather than because the vault depends on it.
    function getTemporalNumericValueV1(bytes32 id)
        external
        view
        returns (TemporalNumericValue memory)
    {
        TemporalNumericValue memory v = values[id];
        require(v.timestampNs != 0, "MockStork: no value");
        return v;
    }
}
