import { ethers } from "hardhat";
import entropyAbi from "@pythnetwork/entropy-sdk-solidity/abis/IEntropy.json"; // Stelle sicher, dass die Datei existiert!

async function main() {
  console.log("🚀 Starting Fee Retrieval Process...");

  // Load environment variables
  const ENTROPY_ADDRESS = "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320";
  const PROVIDER_ADDRESS = "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506";

  // Get the signer
  const [deployer] = await ethers.getSigners();
  console.log(`🧑‍🚀 Using deployer address: ${deployer.address}`);

  // Create an instance of the Entropy contract
  const entropy = new ethers.Contract(ENTROPY_ADDRESS, entropyAbi, deployer);

  // Get the fee for the provider
  const fee = await entropy.getFee(PROVIDER_ADDRESS);
  console.log(`💸 Fee required: ${ethers.formatEther(fee)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
