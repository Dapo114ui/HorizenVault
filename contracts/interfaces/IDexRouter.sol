// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The swap venue a vault routes trades through.
///
/// **No DEX router is documented on Horizen Chain.** Horizen's own docs list
/// token, oracle, bridge and multisig addresses but name no exchange, and the
/// private DEX intended for the ecosystem's app cluster is itself still an
/// open RFP. So this interface is an assumption, not a confirmed ABI: it
/// describes the Uniswap-V2-style surface most EVM routers expose, which is
/// what a Horizen venue is most likely to present.
///
/// Treat this as a seam, not a dependency. The vault holds its own funds and
/// calls out through exactly this interface, so pointing it at a real venue
/// later is a matter of confirming (or adapting to) that venue's ABI rather
/// than reworking the vault. Until one exists, a vault deployed with the zero
/// address for its router simply never trades -- deposits, withdrawals and
/// NAV accounting all work without it.
///
/// This matters more here than it did on X1: the Builder Fund's guidepost
/// metrics for this RFP are execution volume routed, active strategies and
/// fee revenue, all of which require trading to actually happen. A
/// deposit-only deployment cannot satisfy them, so identifying a venue is on
/// the critical path rather than deferrable.
interface IDexRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}
