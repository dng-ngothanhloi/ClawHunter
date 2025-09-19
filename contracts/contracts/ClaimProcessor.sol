// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IClaimProcessor} from "../interfaces/IClaimProcessor.sol";

/**
 * @title ClaimProcessor
 * @notice Processes reward claims with Merkle proof verification and double-claim prevention
 * @dev Implements FR-006 (claim functionality) and FR-010 (double-claim prevention)
 */
contract ClaimProcessor is IClaimProcessor, Ownable, Pausable, ReentrancyGuard {
    /// @notice The RevenueSplitter contract for Merkle root verification
    address public immutable revenueSplitter;
    
    /// @notice Mapping to track claimed rewards (prevents double claiming)
    mapping(bytes32 => bool) private claimed;

    /**
     * @notice Constructor
     * @param owner_ The owner address
     * @param revenueSplitter_ The RevenueSplitter contract address
     */
    constructor(address owner_, address revenueSplitter_) Ownable(owner_) {
        revenueSplitter = revenueSplitter_;
    }

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
    ) external override whenNotPaused nonReentrant {
        require(group <= 4, "Invalid group");
        require(amount > 0, "Amount must be greater than 0");
        
        // Generate unique claim key
        bytes32 claimKey = _getClaimKey(msg.sender, epochId, group, amount);
        require(!claimed[claimKey], "Already claimed");
        
        // Get Merkle root from RevenueSplitter
        bytes32 merkleRoot = _getMerkleRoot(epochId, group);
        require(merkleRoot != bytes32(0), "Merkle root not set");
        
        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "Invalid proof");
        
        // Mark as claimed
        claimed[claimKey] = true;
        
        // Transfer tokens
        IERC20(token).transfer(msg.sender, amount);
        
        // Emit event
        emit Claimed(msg.sender, epochId, group, amount);
    }

    /**
     * @notice Batch claim rewards across multiple epochs/groups
     * @param token The ERC20 token address to claim
     * @param claims Array of claim data structures
     */
    function batchClaim(
        address token,
        ClaimData[] calldata claims
    ) external override whenNotPaused nonReentrant {
        require(claims.length > 0, "No claims provided");
        require(claims.length <= 50, "Too many claims"); // Gas limit protection
        
        uint256 totalAmount = 0;
        
        for (uint256 i = 0; i < claims.length; i++) {
            ClaimData memory claimData = claims[i];
            require(claimData.group <= 4, "Invalid group");
            require(claimData.amount > 0, "Amount must be greater than 0");
            
            // Generate unique claim key
            bytes32 claimKey = _getClaimKey(msg.sender, claimData.epochId, claimData.group, claimData.amount);
            require(!claimed[claimKey], "Already claimed");
            
            // Get Merkle root from RevenueSplitter
            bytes32 merkleRoot = _getMerkleRoot(claimData.epochId, claimData.group);
            require(merkleRoot != bytes32(0), "Merkle root not set");
            
            // Verify Merkle proof
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender, claimData.amount));
            require(MerkleProof.verify(claimData.proof, merkleRoot, leaf), "Invalid proof");
            
            // Mark as claimed
            claimed[claimKey] = true;
            totalAmount += claimData.amount;
            
            // Emit event
            emit Claimed(msg.sender, claimData.epochId, claimData.group, claimData.amount);
        }
        
        // Single token transfer for all claims
        if (totalAmount > 0) {
            IERC20(token).transfer(msg.sender, totalAmount);
        }
    }

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
    ) external view override returns (bool) {
        bytes32 claimKey = _getClaimKey(beneficiary, epochId, group, amount);
        return claimed[claimKey];
    }

    /**
     * @notice Emergency pause functionality (FR-011)
     * @param _paused True to pause, false to unpause
     */
    function setPaused(bool _paused) external override onlyOwner {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
        emit PauseStatusChanged(_paused);
    }

    /**
     * @notice Emergency token recovery (owner only)
     * @param token The token to recover
     * @param amount The amount to recover
     */
    function emergencyRecover(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    /**
     * @notice Generate unique claim key for double-claim prevention
     * @param beneficiary The beneficiary address
     * @param epochId The epoch ID
     * @param group The reward group
     * @param amount The claim amount
     * @return The unique claim key
     */
    function _getClaimKey(
        address beneficiary,
        uint256 epochId,
        uint8 group,
        uint256 amount
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(beneficiary, epochId, group, amount));
    }

    /**
     * @notice Get Merkle root from RevenueSplitter contract
     * @param epochId The epoch ID
     * @param group The reward group
     * @return The Merkle root hash
     */
    function _getMerkleRoot(uint256 epochId, uint8 group) private view returns (bytes32) {
        // Call RevenueSplitter.getMerkleRoot(epochId, group)
        (bool success, bytes memory data) = revenueSplitter.staticcall(
            abi.encodeWithSignature("getMerkleRoot(uint256,uint8)", epochId, group)
        );
        
        if (success && data.length >= 32) {
            return abi.decode(data, (bytes32));
        }
        
        return bytes32(0);
    }
}
