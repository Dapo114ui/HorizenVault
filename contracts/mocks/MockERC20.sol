// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only mintable ERC20 with configurable decimals, so tests can
/// cover 6-decimal stablecoins (USDT) alongside 18-decimal tokens.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Test-only: lets tests simulate a losing trade's NAV impact
    /// directly, without routing it through the risk-checked swap path.
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
