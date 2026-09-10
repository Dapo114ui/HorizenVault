// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Narrow interface StrategyExecutor depends on, so it can call back
/// into its vault without importing the full Vault implementation.
interface IVault {
    function executeSwap(
        address[] calldata path,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}
