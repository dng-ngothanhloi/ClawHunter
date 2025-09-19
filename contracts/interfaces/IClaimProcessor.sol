// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IClaimProcessor
 * @notice Interface for processing reward claims with Merkle proof verification and double-claim prevention
 * @dev Implements FR-006 (claim functionality) and FR-010 (double-claim prevention)
 */
interface IClaimProcessor {
    /// @notice Emitted when a user successfully claims rewards
    event Claimed(address indexed beneficiary, uint256 indexed epochId, uint8 indexed group, uint256 amount);
    
    /// @notice Emitted when emergency pause is activated/deactivated
    event PauseStatusChanged(bool paused);

    /**
     * @notice Claim rewards for a specific epoch and group using Merkle proof
     * @param token The ERC20 token address to claim (e.g., USDT)
     * @param epochId The epoch ID to claim rewards for
     * @param group The reward group (0=OPC, 1=ALPHA, 2=BETA, 3=GAMMA, 4=DELTA)
     * @param amount The amount to claim
     * @param proof Merkle proof verifying the claim
     */
    function claim(
        address token,
        uint256 epochId,
        uint8 group,
        uint256 amount,
        bytes32[] calldata proof
    ) external;

    /**
     * @notice Batch claim rewards across multiple epochs/groups
     * @param token The ERC20 token address to claim
     * @param claims Array of claim data structures
     */
    function batchClaim(
        address token,
        ClaimData[] calldata claims
    ) external;

    /**
     * @notice Check if a specific claim has been processed
     * @param beneficiary The address of the beneficiary
     * @param epochId The epoch ID
     * @param group The reward group
     * @param amount The claim amount
     * @return True if already claimed, false otherwise
     */
    function isClaimed(
        address beneficiary,
        uint256 epochId,
        uint8 group,
        uint256 amount
    ) external view returns (bool);

    /**
     * @notice Emergency pause/unpause functionality (FR-011)
     * @param _paused True to pause, false to unpause
     */
    function setPaused(bool _paused) external;

    /**
     * @notice Check if the contract is currently paused
     * @return True if paused, false otherwise
     * @dev This function is provided by OpenZeppelin's Pausable contract
     */

    /// @notice Claim data structure for batch operations
    struct ClaimData {
        uint256 epochId;
        uint8 group;
        uint256 amount;
        bytes32[] proof;
    }
}
