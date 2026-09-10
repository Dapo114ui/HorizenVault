// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../mocks/MockERC20.sol";
import "../interfaces/IDexRouter.sol";

/// @notice Test-only stand-in for a swap venue: swaps at a fixed,
/// owner-settable rate instead of an AMM curve, so vault tests can exercise
/// deposit/trade/withdraw flows without modelling real slippage.
contract MockDexRouter is IDexRouter {
    // rate is 1e18-scaled: amountOut = amountIn * rate / 1e18
    mapping(address => mapping(address => uint256)) public rates;

    function setRate(address tokenIn, address tokenOut, uint256 rate1e18) external {
        rates[tokenIn][tokenOut] = rate1e18;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        require(path.length == 2, "mock router: single-hop only");
        address tokenIn = path[0];
        address tokenOut = path[1];
        uint256 rate = rates[tokenIn][tokenOut];
        require(rate > 0, "mock router: no rate set");

        uint256 amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= amountOutMin, "mock router: slippage");

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(tokenOut).mint(to, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        require(path.length == 2, "mock router: single-hop only");
        uint256 rate = rates[path[0]][path[1]];
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = (amountIn * rate) / 1e18;
    }
}
