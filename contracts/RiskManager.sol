// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Hardcoded, on-chain risk caps for a single vault. The vault
/// consults these checks around every strategy execution; a breach reverts
/// the trade rather than merely logging a warning, per the grant spec's
/// "hard risk caps enforced on-chain" requirement.
contract RiskManager is Ownable {
    struct Caps {
        uint256 maxPositionSize; // max notional per single trade, in baseAsset terms
        uint256 maxSingleAssetBps; // max share of vault NAV any one non-base asset may represent (10_000 = 100%)
        uint256 maxDrawdownBps; // max allowed drop from high-water-mark NAV/share (10_000 = 100%)
    }

    Caps public caps;

    event CapsUpdated(Caps caps);

    error PositionTooLarge(uint256 amount, uint256 max);
    error AssetExposureTooHigh(uint256 exposureBps, uint256 maxBps);
    error DrawdownExceeded(uint256 drawdownBps, uint256 maxBps);

    constructor(address owner_, Caps memory initialCaps) Ownable(owner_) {
        caps = initialCaps;
    }

    function setCaps(Caps calldata newCaps) external onlyOwner {
        caps = newCaps;
        emit CapsUpdated(newCaps);
    }

    function checkTradeSize(uint256 notionalAmount) external view {
        if (notionalAmount > caps.maxPositionSize) {
            revert PositionTooLarge(notionalAmount, caps.maxPositionSize);
        }
    }

    function checkAssetExposure(uint256 assetValue, uint256 vaultNav) external view {
        if (vaultNav == 0) return;
        uint256 exposureBps = (assetValue * 10_000) / vaultNav;
        if (exposureBps > caps.maxSingleAssetBps) {
            revert AssetExposureTooHigh(exposureBps, caps.maxSingleAssetBps);
        }
    }

    function checkDrawdown(uint256 currentNavPerShare, uint256 highWaterMark) external view {
        if (highWaterMark == 0 || currentNavPerShare >= highWaterMark) return;
        uint256 drawdownBps = ((highWaterMark - currentNavPerShare) * 10_000) / highWaterMark;
        if (drawdownBps > caps.maxDrawdownBps) {
            revert DrawdownExceeded(drawdownBps, caps.maxDrawdownBps);
        }
    }
}
