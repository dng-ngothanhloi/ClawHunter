require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { 
    version: "0.8.26", 
    settings: { 
      optimizer: { enabled: true, runs: 200 },
      viaIR: false // Disable for compatibility
    } 
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    },
    localhost: { 
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      allowUnlimitedContractSize: true
    },
    // AdilChain Devnet Configuration
    adil: {
      url: process.env.ADL_RPC_URL || "https://devnet.adilchain-rpc.io",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: undefined, // Auto-detect at runtime
      gasPrice: "auto",
      gas: "auto", 
      timeout: 60000,
      allowUnlimitedContractSize: true,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: false
    }
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
  etherscan: {
    apiKey: {
      adil: process.env.ETHERSCAN_API_KEY || "NO_API_KEY_NEEDED"
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