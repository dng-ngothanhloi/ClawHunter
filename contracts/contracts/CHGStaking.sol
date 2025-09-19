// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CHGStaking
 * @notice CHG token staking contract with lock duration weights for alpha pool eligibility
 * @dev Implements FR-004 (staking rewards) and FR-013 (investor program)
 */
contract CHGStaking is Ownable, Pausable, ReentrancyGuard {
    /// @notice CHG token contract
    IERC20 public immutable chgToken;
    
    /// @notice Lock duration weights in basis points
    uint256 public constant WEIGHT_30D = 1000;   // 30 days = 1000 bps (1x)
    uint256 public constant WEIGHT_90D = 1500;   // 90 days = 1500 bps (1.5x)
    uint256 public constant WEIGHT_180D = 2000;  // 180 days = 2000 bps (2x)
    uint256 public constant WEIGHT_365D = 3000;  // 365 days = 3000 bps (3x)
    
    /// @notice Minimum lock for investor program (3 years)
    uint256 public constant INVESTOR_MIN_LOCK = 365 * 3; // 1095 days
    
    /// @notice Position counter for unique position IDs
    uint256 private nextPositionId = 1;
    
    /// @notice Staking position structure
    struct StakingPosition {
        address owner;
        uint256 amount;
        uint256 startTime;
        uint32 lockDays;
        uint256 weightBps;
        uint256 claimedToEpoch;
        bool active;
    }
    
    /// @notice Mapping of position ID to staking position
    mapping(uint256 => StakingPosition) public positions;
    
    /// @notice Mapping of user to their position IDs
    mapping(address => uint256[]) public userPositions;
    
    /// @notice Total staked amount
    uint256 public totalStaked;
    
    /// @notice Total effective weight (amount * weight)
    uint256 public totalEffectiveWeight;

    /// @notice Events
    event Staked(address indexed user, uint256 indexed positionId, uint256 amount, uint32 lockDays, uint256 weightBps);
    event Unstaked(address indexed user, uint256 indexed positionId, uint256 amount);
    event Claimed(address indexed user, uint256 indexed positionId, uint256 amount);
    event EmergencyUnstake(address indexed user, uint256 indexed positionId, uint256 amount, uint256 penalty);

    /**
     * @notice Constructor
     * @param owner_ The owner address
     * @param chgToken_ The CHG token contract address
     */
    constructor(address owner_, address chgToken_) Ownable(owner_) {
        chgToken = IERC20(chgToken_);
    }

    /**
     * @notice Stake CHG tokens with specified lock duration
     * @param amount The amount of CHG to stake
     * @param lockDays The lock duration in days
     * @return positionId The unique position ID
     */
    function stake(uint256 amount, uint32 lockDays) external whenNotPaused nonReentrant returns (uint256 positionId) {
        require(amount > 0, "Amount must be greater than 0");
        require(_isValidLockDuration(lockDays), "Invalid lock duration");
        
        // Transfer CHG tokens from user
        chgToken.transferFrom(msg.sender, address(this), amount);
        
        // Calculate weight based on lock duration
        uint256 weightBps = _calculateWeight(lockDays);
        uint256 effectiveWeight = (amount * weightBps) / 1000; // Convert bps to multiplier
        
        // Create position
        positionId = nextPositionId++;
        positions[positionId] = StakingPosition({
            owner: msg.sender,
            amount: amount,
            startTime: block.timestamp,
            lockDays: lockDays,
            weightBps: weightBps,
            claimedToEpoch: 0,
            active: true
        });
        
        // Update user positions
        userPositions[msg.sender].push(positionId);
        
        // Update totals
        totalStaked += amount;
        totalEffectiveWeight += effectiveWeight;
        
        emit Staked(msg.sender, positionId, amount, lockDays, weightBps);
    }

    /**
     * @notice Unstake CHG tokens after lock period expires
     * @param positionId The position ID to unstake
     */
    function unstake(uint256 positionId) external nonReentrant {
        StakingPosition storage position = positions[positionId];
        require(position.owner == msg.sender, "Not position owner");
        require(position.active, "Position not active");
        
        // Check if lock period has expired
        uint256 unlockTime = position.startTime + (position.lockDays * 1 days);
        require(block.timestamp >= unlockTime, "Lock period not expired");
        
        uint256 amount = position.amount;
        uint256 effectiveWeight = (amount * position.weightBps) / 1000;
        
        // Mark position as inactive
        position.active = false;
        
        // Update totals
        totalStaked -= amount;
        totalEffectiveWeight -= effectiveWeight;
        
        // Transfer tokens back to user
        chgToken.transfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, positionId, amount);
    }

    /**
     * @notice Emergency unstake with penalty (for investor program positions)
     * @param positionId The position ID to emergency unstake
     */
    function emergencyUnstake(uint256 positionId) external nonReentrant {
        StakingPosition storage position = positions[positionId];
        require(position.owner == msg.sender, "Not position owner");
        require(position.active, "Position not active");
        
        uint256 amount = position.amount;
        uint256 effectiveWeight = (amount * position.weightBps) / 1000;
        
        // Calculate penalty (50% for early unstaking of investor positions)
        uint256 penalty = 0;
        if (position.lockDays >= INVESTOR_MIN_LOCK) {
            uint256 unlockTime = position.startTime + (position.lockDays * 1 days);
            if (block.timestamp < unlockTime) {
                penalty = amount / 2; // 50% penalty
            }
        }
        
        uint256 withdrawAmount = amount - penalty;
        
        // Mark position as inactive
        position.active = false;
        
        // Update totals
        totalStaked -= amount;
        totalEffectiveWeight -= effectiveWeight;
        
        // Transfer tokens back to user (minus penalty)
        if (withdrawAmount > 0) {
            chgToken.transfer(msg.sender, withdrawAmount);
        }
        
        // Penalty remains in contract (could be used for treasury or burned)
        
        emit EmergencyUnstake(msg.sender, positionId, withdrawAmount, penalty);
    }

    /**
     * @notice Claim rewards for a position (placeholder - actual claiming via ClaimProcessor)
     * @param positionId The position ID
     */
    function claim(uint256 positionId) external {
        StakingPosition storage position = positions[positionId];
        require(position.owner == msg.sender, "Not position owner");
        require(position.active, "Position not active");
        
        // This is a placeholder - actual reward claiming happens via ClaimProcessor
        // with Merkle proofs. This function could be used to update claimedToEpoch
        // or for other bookkeeping purposes.
        
        emit Claimed(msg.sender, positionId, 0);
    }

    /**
     * @notice Get user's active positions
     * @param user The user address
     * @return positionIds Array of active position IDs
     */
    function getUserPositions(address user) external view returns (uint256[] memory positionIds) {
        uint256[] memory allPositions = userPositions[user];
        uint256 activeCount = 0;
        
        // Count active positions
        for (uint256 i = 0; i < allPositions.length; i++) {
            if (positions[allPositions[i]].active) {
                activeCount++;
            }
        }
        
        // Create array of active positions
        positionIds = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allPositions.length; i++) {
            if (positions[allPositions[i]].active) {
                positionIds[index] = allPositions[i];
                index++;
            }
        }
    }

    /**
     * @notice Get position details with calculated unlock time
     * @param positionId The position ID
     * @return position The position details
     * @return unlockTime The unlock timestamp
     * @return isUnlocked Whether the position is currently unlocked
     */
    function getPositionDetails(uint256 positionId) external view returns (
        StakingPosition memory position,
        uint256 unlockTime,
        bool isUnlocked
    ) {
        position = positions[positionId];
        unlockTime = position.startTime + (position.lockDays * 1 days);
        isUnlocked = block.timestamp >= unlockTime;
    }

    /**
     * @notice Emergency pause functionality
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause functionality
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Calculate weight based on lock duration
     * @param lockDays The lock duration in days
     * @return weightBps The weight in basis points
     */
    function _calculateWeight(uint32 lockDays) private pure returns (uint256 weightBps) {
        if (lockDays >= 365) {
            return WEIGHT_365D; // 3000 bps (3x)
        } else if (lockDays >= 180) {
            return WEIGHT_180D; // 2000 bps (2x)
        } else if (lockDays >= 90) {
            return WEIGHT_90D;  // 1500 bps (1.5x)
        } else {
            return WEIGHT_30D;  // 1000 bps (1x)
        }
    }

    /**
     * @notice Check if lock duration is valid
     * @param lockDays The lock duration in days
     * @return True if valid, false otherwise
     */
    function _isValidLockDuration(uint32 lockDays) private pure returns (bool) {
        return lockDays >= 30 && lockDays <= 365 * 5; // 30 days to 5 years
    }
}
