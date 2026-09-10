// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IVault.sol";

/// @notice Trade-routing entry point for a single vault's designated
/// strategy. The vault never hands custody to the trader: this contract
/// only ever tells the vault which swap to run; the vault itself moves its
/// own tokens and runs the risk checks in RiskManager.
contract StrategyExecutor is Ownable {
    IVault public immutable vault;
    address public trader;

    event TraderUpdated(address indexed trader);

    error OnlyTrader();

    modifier onlyTrader() {
        if (msg.sender != trader) revert OnlyTrader();
        _;
    }

    constructor(address owner_, address vault_, address trader_) Ownable(owner_) {
        vault = IVault(vault_);
        trader = trader_;
    }

    function setTrader(address trader_) external onlyOwner {
        trader = trader_;
        emit TraderUpdated(trader_);
    }

    function executeSwap(
        address[] calldata path,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) external onlyTrader returns (uint256[] memory amounts) {
        return vault.executeSwap(path, amountIn, amountOutMin, deadline);
    }
}
