// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    "camp-testnet": {
      url: process.env.CAMP_NETWORK_RPC || "https://rpc-campnetwork.xyz",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 325000,
      gasPrice: "auto"
    },
    "camp-mainnet": {
      url: process.env.CAMP_NETWORK_MAINNET_RPC || "https://rpc-campnetwork.xyz",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 325000, // Même chain ID que testnet
      gasPrice: "auto"
    }
  },
  etherscan: {
    apiKey: {
      "camp-testnet": process.env.CAMP_EXPLORER_API_KEY || "dummy",
      "camp-mainnet": process.env.CAMP_EXPLORER_API_KEY || "dummy"
    },
    customChains: [
      {
        network: "camp-testnet",
        chainId: 325000,
        urls: {
          apiURL: "https://api-testnet.campnetwork.xyz/api",
          browserURL: "https://explorer-testnet.campnetwork.xyz"
        }
      },
      {
        network: "camp-mainnet",
        chainId: 325000,
        urls: {
          apiURL: "https://api.campnetwork.xyz/api",
          browserURL: "https://explorer.campnetwork.xyz"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD"
  }
};

