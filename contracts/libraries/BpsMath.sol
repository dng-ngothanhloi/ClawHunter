// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title BpsMath
 * @notice Library for safe basis points calculations with deterministic floor division
 * @dev Implements integer-only math per FR-002 specification
 */
library BpsMath {
    /// @notice Basis points denominator (10,000 = 100%)
    uint256 public constant DENOM = 10_000;
    
    /// @notice Revenue split constants per FR-002
    uint256 public constant OPC_BPS = 7_000;     // 70%
    uint256 public constant ALPHA_BPS = 2_000;   // 20%
    uint256 public constant BETA_BPS = 300;      // 3%
    uint256 public constant GAMMA_BPS = 300;     // 3%
    uint256 public constant DELTA_BPS = 400;     // 4%

    /**
     * @notice Calculate pool allocation using floor division
     * @param totalAmount The total amount to allocate
     * @param basisPoints The basis points for this allocation
     * @return The allocated amount (floor division)
     */
    function allocate(uint256 totalAmount, uint256 basisPoints) internal pure returns (uint256) {
        return (totalAmount * basisPoints) / DENOM;
    }

    /**
     * @notice Calculate all five pool allocations with remainder
     * @param totalRevenue The total revenue to split
     * @return opc OPC pool allocation (70% + remainder)
     * @return alpha Alpha pool allocation (20%)
     * @return beta Beta pool allocation (3%)
     * @return gamma Gamma pool allocation (3%)
     * @return delta Delta pool allocation (4%)
     * @return remainder The remainder added to OPC
     */
    function splitRevenue(uint256 totalRevenue) internal pure returns (
        uint256 opc,
        uint256 alpha,
        uint256 beta,
        uint256 gamma,
        uint256 delta,
        uint256 remainder
    ) {
        // Floor division for all pools
        uint256 opcBase = allocate(totalRevenue, OPC_BPS);
        alpha = allocate(totalRevenue, ALPHA_BPS);
        beta = allocate(totalRevenue, BETA_BPS);
        gamma = allocate(totalRevenue, GAMMA_BPS);
        delta = allocate(totalRevenue, DELTA_BPS);

        // Calculate remainder and add to OPC (remTop → OPC policy)
        uint256 distributed = opcBase + alpha + beta + gamma + delta;
        remainder = totalRevenue - distributed;
        opc = opcBase + remainder;
    }

    /**
     * @notice Validate that basis points sum to exactly DENOM
     * @dev Used for testing and verification
     * @return True if the constants sum to 10,000 bps
     */
    function validateConstants() internal pure returns (bool) {
        return (OPC_BPS + ALPHA_BPS + BETA_BPS + GAMMA_BPS + DELTA_BPS) == DENOM;
    }
}
