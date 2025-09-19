// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IRevenueSplitter { 
    function distribute(uint256 epoch, uint256 R) external; 
}

/**
 * @title RevenuePool
 * @notice Enhanced revenue posting contract with oracle validation and EIP-712 signatures
 * @dev Implements FR-001 (revenue recording) and FR-012 (oracle validation)
 */
contract RevenuePool is Ownable, EIP712, Pausable {
    using ECDSA for bytes32;

    /// @notice Emitted when revenue is posted for an epoch
    event RevenuePosted(uint256 indexed epochId, uint256 amount, bytes32 merkleRootMachines, address poster);
    
    /// @notice Emitted when oracle allowlist is updated
    event OracleUpdated(address indexed oracle, bool allowed);
    
    /// @notice Emitted when splitter contract is updated
    event SplitterUpdated(address indexed oldSplitter, address indexed newSplitter);

    /// @notice The revenue splitter contract
    IRevenueSplitter public splitter;
    
    /// @notice Mapping of allowed oracle addresses
    mapping(address => bool) public allowedOracles;
    
    /// @notice Mapping to track posted epochs (prevents double posting)
    mapping(uint256 => bool) public epochPosted;

    /// @notice EIP-712 type hash for revenue posting
    bytes32 public constant REVENUE_POST_TYPEHASH = keccak256(
        "RevenuePost(uint256 epochId,uint256 amount,bytes32 merkleRootMachines,uint256 chainId,address contract)"
    );

    /**
     * @notice Constructor
     * @param owner_ The owner address
     */
    constructor(address owner_) 
        Ownable(owner_) 
        EIP712("ClawHuntersRevenuePool", "1") 
    {}

    /**
     * @notice Set the revenue splitter contract
     * @param splitter_ The splitter contract address
     */
    function setSplitter(address splitter_) external onlyOwner {
        address oldSplitter = address(splitter);
        splitter = IRevenueSplitter(splitter_);
        emit SplitterUpdated(oldSplitter, splitter_);
    }

    /**
     * @notice Update oracle allowlist
     * @param oracle The oracle address
     * @param allowed Whether the oracle is allowed
     */
    function setOracle(address oracle, bool allowed) external onlyOwner {
        allowedOracles[oracle] = allowed;
        emit OracleUpdated(oracle, allowed);
    }

    /**
     * @notice Post revenue for an epoch with oracle signature validation
     * @param epochId The epoch ID
     * @param amount The revenue amount
     * @param merkleRootMachines The merkle root for machine-specific revenue
     * @param oracleSig The oracle signature (EIP-712)
     */
    function postRevenue(
        uint256 epochId,
        uint256 amount,
        bytes32 merkleRootMachines,
        bytes calldata oracleSig
    ) external whenNotPaused {
        require(!epochPosted[epochId], "Epoch already posted");
        
        // Construct EIP-712 hash
        bytes32 structHash = keccak256(abi.encode(
            REVENUE_POST_TYPEHASH,
            epochId,
            amount,
            merkleRootMachines,
            block.chainid,
            address(this)
        ));
        
        bytes32 hash = _hashTypedDataV4(structHash);
        
        // Recover signer and validate
        address signer = hash.recover(oracleSig);
        require(allowedOracles[signer], "Invalid oracle signature");
        
        // Mark epoch as posted
        epochPosted[epochId] = true;
        
        // Emit event
        emit RevenuePosted(epochId, amount, merkleRootMachines, signer);
        
        // Trigger distribution if splitter is set
        if (address(splitter) != address(0)) {
            splitter.distribute(epochId, amount);
        }
    }

    /**
     * @notice Emergency pause functionality (FR-011)
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
     * @notice Get the EIP-712 domain separator
     * @return The domain separator hash
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
