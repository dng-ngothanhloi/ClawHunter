// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTOwner
 * @notice ERC-1155 fractional machine ownership tokens for gamma pool eligibility
 * @dev Implements fractional ownership with L2 staking for gamma pool rewards
 */
contract NFTOwner is ERC1155, ERC1155Burnable, Ownable, Pausable {
    /// @notice Mapping of token ID to machine ID
    mapping(uint256 => uint256) public machineOf;
    
    /// @notice Mapping of token ID to share in basis points (max 10,000)
    mapping(uint256 => uint256) public shareBps;
    
    /// @notice Mapping of token ID to L2 staking status for gamma pool eligibility
    mapping(uint256 => mapping(address => uint256)) public stakedForL2; // tokenId => user => amount
    
    /// @notice Mapping of token ID to total staked amount
    mapping(uint256 => uint256) public totalStakedL2;
    
    /// @notice Mapping of machine ID to expiration timestamp
    mapping(uint256 => uint256) public machineExpiration;

    /// @notice Events
    event TokenMetaSet(uint256 indexed tokenId, uint256 indexed machineId, uint256 shareBps);
    event StakedL2(uint256 indexed tokenId, address indexed user, uint256 amount);
    event UnstakedL2(uint256 indexed tokenId, address indexed user, uint256 amount);
    event MachineExpired(uint256 indexed machineId, uint256[] tokenIds);
    event TokensBurned(uint256 indexed machineId, uint256[] tokenIds, uint256[] amounts);

    /**
     * @notice Constructor
     * @param uri_ The base URI for token metadata
     */
    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    /**
     * @notice Set token metadata (machine ID and share)
     * @param tokenId The token ID
     * @param machineId The machine ID this token represents
     * @param share The ownership share in basis points (max 10,000)
     */
    function setTokenMeta(uint256 tokenId, uint256 machineId, uint256 share) external onlyOwner {
        require(share <= 10_000, "Invalid share: exceeds 10,000 bps");
        machineOf[tokenId] = machineId;
        shareBps[tokenId] = share;
        
        emit TokenMetaSet(tokenId, machineId, share);
    }

    /**
     * @notice Set machine expiration timestamp
     * @param machineId The machine ID
     * @param expirationTime The expiration timestamp
     */
    function setMachineExpiration(uint256 machineId, uint256 expirationTime) external onlyOwner {
        machineExpiration[machineId] = expirationTime;
    }

    /**
     * @notice Mint NFTOwner tokens
     * @param to The address to mint to
     * @param tokenId The token ID
     * @param amount The amount to mint
     */
    function mint(address to, uint256 tokenId, uint256 amount) external onlyOwner whenNotPaused {
        require(shareBps[tokenId] > 0, "Token metadata not set");
        _mint(to, tokenId, amount, "");
    }

    /**
     * @notice Batch mint NFTOwner tokens
     * @param to The address to mint to
     * @param tokenIds Array of token IDs
     * @param amounts Array of amounts to mint
     */
    function mintBatch(address to, uint256[] memory tokenIds, uint256[] memory amounts) external onlyOwner whenNotPaused {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(shareBps[tokenIds[i]] > 0, "Token metadata not set");
        }
        _mintBatch(to, tokenIds, amounts, "");
    }

    /**
     * @notice Stake NFTOwner tokens for L2 gamma pool eligibility
     * @param tokenId The token ID to stake
     * @param amount The amount to stake
     */
    function stakeForL2(uint256 tokenId, uint256 amount) external whenNotPaused {
        require(balanceOf(msg.sender, tokenId) >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be greater than 0");
        
        // Check if machine is not expired
        uint256 machineId = machineOf[tokenId];
        require(machineExpiration[machineId] == 0 || block.timestamp < machineExpiration[machineId], "Machine expired");
        
        stakedForL2[tokenId][msg.sender] += amount;
        totalStakedL2[tokenId] += amount;
        
        emit StakedL2(tokenId, msg.sender, amount);
    }

    /**
     * @notice Unstake NFTOwner tokens from L2 gamma pool
     * @param tokenId The token ID to unstake
     * @param amount The amount to unstake
     */
    function unstakeFromL2(uint256 tokenId, uint256 amount) external {
        require(stakedForL2[tokenId][msg.sender] >= amount, "Insufficient staked amount");
        require(amount > 0, "Amount must be greater than 0");
        
        stakedForL2[tokenId][msg.sender] -= amount;
        totalStakedL2[tokenId] -= amount;
        
        emit UnstakedL2(tokenId, msg.sender, amount);
    }

    /**
     * @notice Burn tokens when machine expires or is decommissioned (FR-015)
     * @param machineId The machine ID
     * @param tokenIds Array of token IDs to burn
     * @param holders Array of token holders
     * @param amounts Array of amounts to burn per holder
     */
    function burnExpiredTokens(
        uint256 machineId,
        uint256[] memory tokenIds,
        address[] memory holders,
        uint256[] memory amounts
    ) external onlyOwner {
        require(tokenIds.length == holders.length && holders.length == amounts.length, "Array length mismatch");
        
        // Mark machine as expired if not already
        if (machineExpiration[machineId] == 0) {
            machineExpiration[machineId] = block.timestamp;
        }
        
        // Burn tokens and clear staking
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(machineOf[tokenId] == machineId, "Token not for this machine");
            
            // Clear L2 staking for this holder
            if (stakedForL2[tokenId][holders[i]] > 0) {
                totalStakedL2[tokenId] -= stakedForL2[tokenId][holders[i]];
                stakedForL2[tokenId][holders[i]] = 0;
            }
            
            // Burn tokens
            _burn(holders[i], tokenId, amounts[i]);
        }
        
        emit MachineExpired(machineId, tokenIds);
        emit TokensBurned(machineId, tokenIds, amounts);
    }

    /**
     * @notice Get user's L2 staked amounts for all tokens
     * @param user The user address
     * @return tokenIds Array of token IDs
     * @return stakedAmounts Array of staked amounts
     */
    function getUserL2Stakes(address user) external view returns (uint256[] memory tokenIds, uint256[] memory stakedAmounts) {
        // This is a simplified version - in practice, you'd need to track user's tokens
        // For now, return empty arrays as this would require additional storage tracking
        tokenIds = new uint256[](0);
        stakedAmounts = new uint256[](0);
    }

    /**
     * @notice Get token details including machine ID, share, and staking info
     * @param tokenId The token ID
     * @return machineId The associated machine ID
     * @return shareBasisPoints The ownership share in basis points
     * @return totalStaked The total amount staked for L2
     * @return isExpired Whether the machine is expired
     */
    function getTokenDetails(uint256 tokenId) external view returns (
        uint256 machineId,
        uint256 shareBasisPoints,
        uint256 totalStaked,
        bool isExpired
    ) {
        machineId = machineOf[tokenId];
        shareBasisPoints = shareBps[tokenId];
        totalStaked = totalStakedL2[tokenId];
        
        uint256 expiration = machineExpiration[machineId];
        isExpired = expiration > 0 && block.timestamp >= expiration;
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
     * @notice Override _update to include pause functionality and handle staking on transfer
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        require(!paused(), "Token transfers paused");
        
        // Handle L2 staking on transfer - unstake when tokens are transferred
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                uint256 tokenId = ids[i];
                uint256 transferAmount = values[i];
                uint256 stakedAmount = stakedForL2[tokenId][from];
                
                if (stakedAmount > 0) {
                    uint256 unstakeAmount = stakedAmount > transferAmount ? transferAmount : stakedAmount;
                    stakedForL2[tokenId][from] -= unstakeAmount;
                    totalStakedL2[tokenId] -= unstakeAmount;
                    
                    emit UnstakedL2(tokenId, from, unstakeAmount);
                }
            }
        }
        
        super._update(from, to, ids, values);
    }
}
