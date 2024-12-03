import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import "@nomicfoundation/hardhat-verify";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_DEV_KEY;
const APESCAN_KEY = process.env.APESCAN_KEY;

if (!PRIVATE_KEY) {
  throw new Error("Please set your PRIVATE_DEV_KEY in a .env file");
}

if (!APESCAN_KEY) {
  throw new Error("Please set your APESCAN_KEY in a .env file");
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      chainId: 31337,
    },

    ApeChain: {
      url: "https://apechain.calderachain.xyz/http",
      accounts: [PRIVATE_KEY],
    },
    curtis: {
      url: "https://curtis.rpc.caldera.xyz/http",
      accounts: [PRIVATE_KEY],
    },
    sepolia: {
      url: "https://sepolia.infura.io/v3/6ff412932fd749c9b380385bd4d7c13d",
      accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 2000,
      },
      outputSelection: {
        "*": {
          "*": ["metadata", "evm.bytecode", "evm.deployedBytecode", "abi"],
        },
      },
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },

  sourcify: {
    enabled: false,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  etherscan: {
    apiKey: {
      curtis: APESCAN_KEY,
      ApeChain: APESCAN_KEY,
    },
    customChains: [
      {
        network: "ApeChain",
        chainId: 33139,
        urls: {
          apiURL: "https://api.apescan.io/api",
          browserURL: "https://apechain.calderachain.xyz",
        },
      },
      {
        network: "curtis",
        chainId: 33111,
        urls: {
          apiURL: "https://curtis.explorer.caldera.xyz/api",
          browserURL: "https://curtis.explorer.caldera.xyz/",
        },
      },
    ],
  },
};

export default config;
