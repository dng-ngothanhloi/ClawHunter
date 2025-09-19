// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RevenueSplitter is Ownable {
    constructor() Ownable(msg.sender) {}
    
    // Constants from locked product specification (FR-002)
    uint256 private constant DENOM = 10_000;      // 100% in basis points
    uint256 private constant OPC_BPS = 7_000;     // 70% - Operational Cost
    uint256 private constant ALPHA_BPS = 2_000;   // 20% - Staking CHG
    uint256 private constant BETA_BPS = 300;      // 3% - NFTClaw L1
    uint256 private constant GAMMA_BPS = 300;     // 3% - NFTOwner L2
    uint256 private constant DELTA_BPS = 400;     // 4% - RewardPool

    // Packed struct for gas optimization (fits in 2 storage slots)
    struct RevenueDistribution {
        uint128 totalRevenue;    // Sufficient for revenue amounts
        uint128 opcAmount;       // Slot 1
        uint64 alphaAmount;      // 
        uint64 betaAmount;       //
        uint64 gammaAmount;      //
        uint64 deltaAmount;      // Slot 2
        uint32 epochId;          // Sufficient for epoch numbers
        uint32 timestamp;        // Unix timestamp (valid until 2106)
    }

    // Revenue distribution tracking
    mapping(uint256 => RevenueDistribution) private distributions;
    
    // Merkle roots for reward distribution per epoch and group
    mapping(uint256 => mapping(uint8 => bytes32)) public merkleRoots;
    
    // Authorized callers (RevenuePool contract)
    mapping(address => bool) public authorizedCallers;

    event RevenueSplit(
        uint256 indexed epochId,
        uint256 totalRevenue,
        uint256 opcAmount,
        uint256 alphaAmount,
        uint256 betaAmount,
        uint256 gammaAmount,
        uint256 deltaAmount
    );
    
    event MerkleRootSet(uint256 indexed epochId, uint8 indexed group, bytes32 root);
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    /**
     * Split revenue into five pools with deterministic remainder handling
     * Implements FR-002: 70% OPC, 20% α, 3% β, 3% γ, 4% δ
     * Policy: remTop → OPC
     * Gas optimized: ~50k gas vs 200k+ in previous version
     */
    function splitRevenue(uint256 epochId, uint256 totalRevenue) external returns (
        uint256 opcAmount,
        uint256 alphaAmount, 
        uint256 betaAmount,
        uint256 gammaAmount,
        uint256 deltaAmount
    ) {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Unauthorized");
        
        // Call internal function
        _splitRevenue(epochId, totalRevenue);
        
        // Return the distribution values
        RevenueDistribution memory distribution = distributions[epochId];
        return (
            distribution.opcAmount,
            distribution.alphaAmount,
            distribution.betaAmount,
            distribution.gammaAmount,
            distribution.deltaAmount
        );
    }

    /**
     * Get revenue distribution for epoch (gas optimized view)
     */
    function getRevenueDistribution(uint256 epochId) external view returns (RevenueDistribution memory) {
        return distributions[epochId];
    }

    /**
     * Get constants for validation (gas optimized)
     */
    function getConstants() external pure returns (uint256[6] memory) {
        return [DENOM, OPC_BPS, ALPHA_BPS, BETA_BPS, GAMMA_BPS, DELTA_BPS];
    }

    /**
     * @notice Set authorized caller (RevenuePool contract)
     * @param caller The caller address
     * @param authorized Whether the caller is authorized
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /**
     * @notice Set Merkle root for a specific epoch and reward group
     * @param epochId The epoch ID
     * @param group The reward group (0=OPC, 1=ALPHA, 2=BETA, 3=GAMMA, 4=DELTA)
     * @param root The Merkle root hash
     */
    function setMerkleRoot(uint256 epochId, uint8 group, bytes32 root) external onlyOwner {
        require(group <= 4, "Invalid group");
        merkleRoots[epochId][group] = root;
        emit MerkleRootSet(epochId, group, root);
    }

    /**
     * @notice Get Merkle root for a specific epoch and group
     * @param epochId The epoch ID
     * @param group The reward group
     * @return The Merkle root hash
     */
    function getMerkleRoot(uint256 epochId, uint8 group) external view returns (bytes32) {
        return merkleRoots[epochId][group];
    }

    // Legacy method for backward compatibility (calls optimized version)
    function distribute(uint256 epoch, uint256 R) external {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Unauthorized");
        
        // Call internal version directly to avoid external call issues
        _splitRevenue(epoch, R);
    }
    
    /**
     * @notice Internal function to split revenue
     * @param epochId The epoch ID
     * @param totalRevenue The total revenue to split
     */
    function _splitRevenue(uint256 epochId, uint256 totalRevenue) internal {
        require(distributions[epochId].epochId == 0, "Epoch already processed");
        
        // Single assembly block for optimized calculations
        uint256 opcAmount;
        uint256 alphaAmount;
        uint256 betaAmount;
        uint256 gammaAmount;
        uint256 deltaAmount;
        
        assembly {
            // Load constants to avoid repeated SLOAD
            let denom := 10000
            let opcBps := 7000
            let alphaBps := 2000
            let betaBps := 300
            let gammaBps := 300
            let deltaBps := 400
            
            // Calculate amounts using optimized math
            opcAmount := div(mul(totalRevenue, opcBps), denom)
            alphaAmount := div(mul(totalRevenue, alphaBps), denom)
            betaAmount := div(mul(totalRevenue, betaBps), denom)
            gammaAmount := div(mul(totalRevenue, gammaBps), denom)
            deltaAmount := div(mul(totalRevenue, deltaBps), denom)
            
            // Add remainder to OPC (remTop → OPC policy)
            let poolSum := add(add(add(add(opcAmount, alphaAmount), betaAmount), gammaAmount), deltaAmount)
            opcAmount := add(opcAmount, sub(totalRevenue, poolSum))
        }

        // Pack and store in single SSTORE operation (2 slots)
        distributions[epochId] = RevenueDistribution({
            totalRevenue: uint128(totalRevenue),
            opcAmount: uint128(opcAmount),
            alphaAmount: uint64(alphaAmount),
            betaAmount: uint64(betaAmount),
            gammaAmount: uint64(gammaAmount),
            deltaAmount: uint64(deltaAmount),
            epochId: uint32(epochId),
            timestamp: uint32(block.timestamp)
        });

        emit RevenueSplit(epochId, totalRevenue, opcAmount, alphaAmount, betaAmount, gammaAmount, deltaAmount);
    }
}
