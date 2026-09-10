// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./Vault.sol";
import "./ShareToken.sol";
import "./RiskManager.sol";
import "./StrategyExecutor.sol";
import "./interfaces/IDexRouter.sol";
import "./interfaces/IStork.sol";

/// @notice Deploys a Vault plus its ShareToken, RiskManager and
/// StrategyExecutor as one unit, so each strategy gets an isolated,
/// independently risk-capped vault instance sharing one swap venue and one
/// Stork oracle.
///
/// The per-strategy isolation here is the seed of what the Horizen RFP calls
/// "strategy supply as a first-class design problem": every strategy already
/// gets its own vault, its own risk caps and its own trader, and onboarding
/// is curated through the deployer allowlist. What is still missing is
/// ranking strategies on attested performance -- which needs the
/// confidentiality layer first, since ranking public vaults just republishes
/// the edge they are trying to protect.
contract VaultFactory is Ownable {
    /// @notice Ceiling on a vault's performance fee. 20% is the conventional
    /// rate; this leaves room above it while making a confiscatory fee
    /// impossible to deploy, which matters once deployment is delegated to
    /// approved operators rather than the owner alone.
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 3_000;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    IDexRouter public immutable router;
    IStork public immutable oracle;

    address[] public vaults;

    /// @notice Who deployed each vault. The factory owner still owns every
    /// vault (see `deployVault`), so this records the operator behind a
    /// strategy, which is not the same address.
    mapping(address => address) public vaultDeployer;

    /// @notice Addresses permitted to deploy vaults besides the owner.
    /// Curated rather than open while the protocol is unaudited: an
    /// unrestricted factory would let anyone publish a vault that appears in
    /// the same interface as reviewed ones.
    mapping(address => bool) public isApprovedDeployer;

    event VaultDeployed(
        address indexed vault,
        address indexed shareToken,
        address indexed strategyExecutor,
        address riskManager,
        address trader,
        address deployer
    );
    event DeployerApprovalUpdated(address indexed deployer, bool approved);

    error NotApprovedDeployer(address caller);
    error PerformanceFeeTooHigh(uint256 bps, uint256 max);
    error BpsOutOfRange(uint256 bps);
    error ZeroPositionCap();
    error ZeroAddressBaseAsset();
    error ZeroAddressTrader();
    error ZeroAddressFeeRecipient();

    /// @dev The owner is always permitted, so approving addresses is purely
    /// additive and the owner can never lock itself out.
    modifier onlyApprovedDeployer() {
        if (msg.sender != owner() && !isApprovedDeployer[msg.sender]) {
            revert NotApprovedDeployer(msg.sender);
        }
        _;
    }

    struct DeployParams {
        IERC20 baseAsset;
        string shareName;
        string shareSymbol;
        address trader;
        address feeRecipient;
        uint256 performanceFeeBps;
        uint256 maxOracleAge;
        /// @dev Zero means uncapped; set it here rather than after deploy so
        /// a guarded launch has no uncapped window.
        uint256 depositCap;
        RiskManager.Caps caps;
    }

    constructor(address owner_, IDexRouter router_, IStork oracle_) Ownable(owner_) {
        router = router_;
        oracle = oracle_;
    }

    /// @notice Approve or revoke an address's ability to deploy vaults.
    /// Revoking does not affect vaults that address has already deployed.
    function setDeployer(address deployer, bool approved) external onlyOwner {
        isApprovedDeployer[deployer] = approved;
        emit DeployerApprovalUpdated(deployer, approved);
    }

    /// @notice Deploy a vault and its supporting contracts.
    ///
    /// Ownership of the Vault, RiskManager and StrategyExecutor goes to the
    /// factory owner, not to the caller. That is deliberate: an approved
    /// operator trades their vault but cannot widen its own risk caps or
    /// reassign its own trader, so the caps stay a protocol guarantee rather
    /// than an operator preference.
    ///
    /// `p.baseAsset` needs no explicit check here -- Vault's constructor
    /// reads `decimals()` off it, which reverts for a non-token address.
    function deployVault(DeployParams calldata p)
        external
        onlyApprovedDeployer
        returns (address vaultAddr)
    {
        if (address(p.baseAsset) == address(0)) revert ZeroAddressBaseAsset();
        if (p.trader == address(0)) revert ZeroAddressTrader();
        if (p.feeRecipient == address(0)) revert ZeroAddressFeeRecipient();
        if (p.performanceFeeBps > MAX_PERFORMANCE_FEE_BPS) {
            revert PerformanceFeeTooHigh(p.performanceFeeBps, MAX_PERFORMANCE_FEE_BPS);
        }
        // A zero position cap reverts every trade, bricking the strategy.
        if (p.caps.maxPositionSize == 0) revert ZeroPositionCap();
        if (p.caps.maxSingleAssetBps > BPS_DENOMINATOR) {
            revert BpsOutOfRange(p.caps.maxSingleAssetBps);
        }
        if (p.caps.maxDrawdownBps > BPS_DENOMINATOR) {
            revert BpsOutOfRange(p.caps.maxDrawdownBps);
        }

        address realOwner = owner();

        ShareToken shareToken = new ShareToken(p.shareName, p.shareSymbol, address(this));
        RiskManager riskManager = new RiskManager(realOwner, p.caps);

        // Vault is temporarily owned by the factory so it can wire up the
        // strategy executor below, then ownership moves to realOwner.
        Vault vault = new Vault(
            address(this),
            p.baseAsset,
            shareToken,
            riskManager,
            router,
            oracle,
            p.feeRecipient,
            p.performanceFeeBps,
            p.maxOracleAge,
            p.depositCap
        );
        vaultAddr = address(vault);

        shareToken.setVault(vaultAddr);

        StrategyExecutor executor = new StrategyExecutor(realOwner, vaultAddr, p.trader);
        vault.setStrategyExecutor(address(executor));
        vault.transferOwnership(realOwner);

        vaults.push(vaultAddr);
        vaultDeployer[vaultAddr] = msg.sender;
        emit VaultDeployed(
            vaultAddr,
            address(shareToken),
            address(executor),
            address(riskManager),
            p.trader,
            msg.sender
        );
    }

    function vaultsCount() external view returns (uint256) {
        return vaults.length;
    }
}
