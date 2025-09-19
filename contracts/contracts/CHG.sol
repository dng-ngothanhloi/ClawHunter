// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CHG - Claw Hunters Token
 * @notice ERC20 token with capped supply and hybrid-ready Phase 2 design
 * @dev Phase 2: EmissionsController contract can be granted MINTER_ROLE for controlled emissions
 */
contract CHG is ERC20, ERC20Permit, Pausable, Ownable, AccessControl {
    /// @notice Maximum total supply: 1 billion tokens (capped for MVP)
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18;
    
    /// @notice Role for authorized minters (Phase 2: EmissionsController will hold this role)
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    /// @notice Initial mint allocation breakdown
    uint256 public constant TREASURY_ALLOCATION = 400_000_000e18;  // 40%
    uint256 public constant LIQUIDITY_ALLOCATION = 200_000_000e18; // 20%
    uint256 public constant REWARDS_ALLOCATION = 200_000_000e18;   // 20%
    uint256 public constant TEAM_ALLOCATION = 100_000_000e18;      // 10%
    uint256 public constant RESERVE_ALLOCATION = 100_000_000e18;   // 10%
    
    /// @notice Treasury address for operational costs
    address public immutable treasury;
    
    /// @notice Liquidity pool address for DEX listing
    address public immutable liquidityPool;
    
    /// @notice Rewards pool address for staking rewards
    address public immutable rewardsPool;
    
    /// @notice Team allocation address (with vesting)
    address public immutable teamAllocation;
    
    /// @notice Reserve address for future use
    address public immutable reserve;
    
    /**
     * @notice Constructor with structured allocation and hybrid-ready design
     * @dev Phase 2: EmissionsController contract can be granted MINTER_ROLE for controlled emissions
     * @param owner_ Owner address (multisig)
     * @param treasury_ Treasury address for operational costs
     * @param liquidityPool_ Liquidity pool address for DEX listing
     * @param rewardsPool_ Rewards pool address for staking rewards
     * @param teamAllocation_ Team allocation address (with vesting)
     * @param reserve_ Reserve address for future use
     */
    constructor(
        address owner_,
        address treasury_,
        address liquidityPool_,
        address rewardsPool_,
        address teamAllocation_,
        address reserve_
    ) ERC20("Claw Hunters Token", "CHG") ERC20Permit("Claw Hunters Token") Ownable(owner_) {
        treasury = treasury_;
        liquidityPool = liquidityPool_;
        rewardsPool = rewardsPool_;
        teamAllocation = teamAllocation_;
        reserve = reserve_;
        
        // Grant MINTER_ROLE to owner (multisig) - Phase 2: can transfer to EmissionsController
        _grantRole(MINTER_ROLE, owner_);
        
        // Initial mint to specified addresses
        _mint(treasury, TREASURY_ALLOCATION);
        _mint(liquidityPool, LIQUIDITY_ALLOCATION);
        _mint(rewardsPool, REWARDS_ALLOCATION);
        _mint(teamAllocation, TEAM_ALLOCATION);
        _mint(reserve, RESERVE_ALLOCATION);
    }
    
    /**
     * @notice Mint additional tokens (up to MAX_SUPPLY)
     * @dev Phase 2: EmissionsController will call this function with controlled emissions
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
    
    /**
     * @notice Phase 2: Grant MINTER_ROLE to EmissionsController for controlled emissions
     * @dev This enables hybrid approach without breaking storage layout
     * @param emissionsController Address of the emissions controller contract
     */
    function grantMinterRoleToEmissionsController(address emissionsController) external onlyOwner {
        _grantRole(MINTER_ROLE, emissionsController);
        // Owner can retain role or revoke it after granting to EmissionsController
    }
    
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    
    function burn(uint256 amount) external { _burn(msg.sender, amount); }
    
    function _update(address from, address to, uint256 amount) internal override {
        require(!paused(), "paused");
        super._update(from, to, amount);
    }
}
