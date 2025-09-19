// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTClaw
 * @notice ERC-721 claw machine identity tokens for beta pool eligibility
 * @dev Implements claw machine identity with L1 staking for beta pool rewards
 */
contract NFTClaw is ERC721, ERC721Enumerable, Ownable, Pausable {
    /// @notice Base URI for token metadata
    string private baseTokenURI;
    
    /// @notice Mapping of token ID to machine ID
    mapping(uint256 => uint256) public tokenToMachine;
    
    /// @notice Mapping of machine ID to token ID (reverse lookup)
    mapping(uint256 => uint256) public machineToToken;
    
    /// @notice Mapping of token ID to L1 staking status for beta pool eligibility
    mapping(uint256 => bool) public stakedForL1;
    
    /// @notice Mapping of token ID to staking timestamp
    mapping(uint256 => uint256) public stakingTimestamp;
    
    /// @notice Counter for token IDs
    uint256 private nextTokenId = 1;

    /// @notice Events
    event MachineTokenMinted(uint256 indexed tokenId, uint256 indexed machineId, address indexed owner);
    event TokenBurned(uint256 indexed tokenId, uint256 indexed machineId);
    event StakedL1(uint256 indexed tokenId, address indexed owner);
    event UnstakedL1(uint256 indexed tokenId, address indexed owner);
    event BaseURIUpdated(string newBaseURI);

    /**
     * @notice Constructor
     * @param owner_ The owner address
     * @param name_ The token name
     * @param symbol_ The token symbol
     * @param baseURI_ The base URI for token metadata
     */
    constructor(
        address owner_,
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    ) ERC721(name_, symbol_) Ownable(owner_) {
        baseTokenURI = baseURI_;
    }

    /**
     * @notice Mint a new claw machine NFT
     * @param to The address to mint to
     * @param machineId The unique machine ID
     * @return tokenId The minted token ID
     */
    function mint(address to, uint256 machineId) external onlyOwner whenNotPaused returns (uint256 tokenId) {
        require(machineToToken[machineId] == 0, "Machine already has token");
        
        tokenId = nextTokenId++;
        
        // Store machine mapping
        tokenToMachine[tokenId] = machineId;
        machineToToken[machineId] = tokenId;
        
        // Mint token
        _mint(to, tokenId);
        
        emit MachineTokenMinted(tokenId, machineId, to);
    }

    /**
     * @notice Burn a claw machine NFT (when machine is decommissioned)
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        
        uint256 machineId = tokenToMachine[tokenId];
        
        // Clear mappings
        delete tokenToMachine[tokenId];
        delete machineToToken[machineId];
        delete stakedForL1[tokenId];
        delete stakingTimestamp[tokenId];
        
        // Burn token
        _burn(tokenId);
        
        emit TokenBurned(tokenId, machineId);
    }

    /**
     * @notice Stake NFTClaw token for L1 beta pool eligibility
     * @param tokenId The token ID to stake
     */
    function stakeForL1(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(!stakedForL1[tokenId], "Already staked for L1");
        
        stakedForL1[tokenId] = true;
        stakingTimestamp[tokenId] = block.timestamp;
        
        emit StakedL1(tokenId, msg.sender);
    }

    /**
     * @notice Unstake NFTClaw token from L1 beta pool
     * @param tokenId The token ID to unstake
     */
    function unstakeFromL1(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(stakedForL1[tokenId], "Not staked for L1");
        
        stakedForL1[tokenId] = false;
        stakingTimestamp[tokenId] = 0;
        
        emit UnstakedL1(tokenId, msg.sender);
    }

    /**
     * @notice Get all tokens staked for L1 by an owner
     * @param owner The owner address
     * @return stakedTokens Array of token IDs staked for L1
     */
    function getL1StakedTokens(address owner) external view returns (uint256[] memory stakedTokens) {
        uint256 balance = balanceOf(owner);
        uint256 stakedCount = 0;
        
        // Count staked tokens
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            if (stakedForL1[tokenId]) {
                stakedCount++;
            }
        }
        
        // Create array of staked tokens
        stakedTokens = new uint256[](stakedCount);
        uint256 index = 0;
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            if (stakedForL1[tokenId]) {
                stakedTokens[index] = tokenId;
                index++;
            }
        }
    }

    /**
     * @notice Get token details including machine ID and staking status
     * @param tokenId The token ID
     * @return machineId The associated machine ID
     * @return isStakedL1 Whether the token is staked for L1
     * @return stakingTime The staking timestamp (0 if not staked)
     */
    function getTokenDetails(uint256 tokenId) external view returns (
        uint256 machineId,
        bool isStakedL1,
        uint256 stakingTime
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        
        machineId = tokenToMachine[tokenId];
        isStakedL1 = stakedForL1[tokenId];
        stakingTime = stakingTimestamp[tokenId];
    }

    /**
     * @notice Set the base URI for token metadata
     * @param newBaseURI The new base URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
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
     * @notice Override transfer to handle L1 staking status and pause functionality
     * @dev Unstake from L1 when token is transferred
     */
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) whenNotPaused returns (address) {
        address previousOwner = super._update(to, tokenId, auth);
        
        // Unstake from L1 when token is transferred
        if (previousOwner != address(0) && to != address(0) && stakedForL1[tokenId]) {
            stakedForL1[tokenId] = false;
            stakingTimestamp[tokenId] = 0;
            emit UnstakedL1(tokenId, previousOwner);
        }
        
        return previousOwner;
    }

    /**
     * @notice Override _increaseBalance for ERC721Enumerable compatibility
     */
    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    /**
     * @notice Override supportsInterface for multiple inheritance
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Get the base URI for token metadata
     * @return The base URI string
     */
    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }
}
