import { HardhatUserConfig } from "hardhat/config";
import { config as dotenvConfig } from "dotenv";

// Load environment variables
dotenvConfig();

/**
 * AdilChain Devnet Network Configuration
 * 
 * Network Details:
 * - Name: AdilChain Devnet
 * - RPC: https://devnet.adilchain-rpc.io
 * - Explorer: https://devnet.adilchain-scan.io
 * - Deployer: 0x12a87E08a5885Aaf05D7663698b901B8f0DB3e40
 */

const adilDevnet = {
  url: process.env.ADL_RPC_URL || "https://devnet.adilchain-rpc.io",
  accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
  chainId: undefined, // Auto-detect at runtime
  gasPrice: "auto", // Auto-detect gas price
  gas: "auto", // Auto-detect gas limit
  timeout: 60000, // 60 second timeout
  allowUnlimitedContractSize: true, // For large contracts
  blockGasLimit: 30000000, // 30M gas block limit
  
  // Deployment configuration
  verify: {
    etherscan: {
      apiUrl: process.env.ADL_EXPLORER_URL || "https://devnet.adilchain-scan.io",
      apiKey: process.env.ETHERSCAN_API_KEY || "NO_API_KEY_NEEDED"
    }
  },
  
  // Transaction configuration
  confirmations: 2, // Wait for 2 confirmations
  timeoutBlocks: 200, // Timeout after 200 blocks
  skipDryRun: false, // Always run dry run first
  
  // Logging
  loggingEnabled: true,
  verbose: process.env.HARDHAT_VERBOSE === "true"
};

const adilNetworkConfig: HardhatUserConfig = {
  networks: {
    adil: adilDevnet,
    "adil-devnet": adilDevnet, // Alias
    "adilchain-devnet": adilDevnet // Alternative alias
  },
  
  // Etherscan configuration for verification
  etherscan: {
    apiKey: {
      adil: process.env.ETHERSCAN_API_KEY || "NO_API_KEY_NEEDED",
      "adil-devnet": process.env.ETHERSCAN_API_KEY || "NO_API_KEY_NEEDED"
    },
    customChains: [
      {
        network: "adil",
        chainId: 0, // Will be auto-detected
        urls: {
          apiURL: process.env.ADL_EXPLORER_URL || "https://devnet.adilchain-scan.io",
          browserURL: process.env.ADL_EXPLORER_URL || "https://devnet.adilchain-scan.io"
        }
      }
    ]
  }
};

export default adilNetworkConfig;

// Export individual network config for direct use
export { adilDevnet };

// Network validation helper
export async function validateAdilNetwork(ethers: any): Promise<boolean> {
  try {
    const network = await ethers.provider.getNetwork();
    console.log("Connected to network:", network.name, "Chain ID:", network.chainId);
    
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log("Current block number:", blockNumber);
    
    return blockNumber > 0;
  } catch (error) {
    console.error("Network validation failed:", error);
    return false;
  }
}

// Deployer account validation helper
export async function validateDeployerAccount(ethers: any): Promise<boolean> {
  try {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("Deployer address:", deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "ETH");
    
    // Require at least 0.1 ETH for deployment
    const minBalance = ethers.parseEther("0.1");
    return balance >= minBalance;
  } catch (error) {
    console.error("Deployer validation failed:", error);
    return false;
  }
}

// Gas price helper
export async function getOptimalGasPrice(ethers: any): Promise<bigint> {
  try {
    const gasPrice = await ethers.provider.getGasPrice();
    console.log("Current gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
    
    // Add 10% buffer for faster confirmation
    return gasPrice * 110n / 100n;
  } catch (error) {
    console.error("Gas price detection failed:", error);
    return ethers.parseUnits("20", "gwei"); // Fallback to 20 gwei
  }
}
