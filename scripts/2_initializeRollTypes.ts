import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { rollTypes } from "./rolltype";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonForge = "0x8F6708d8d476917D8A7E91f8087dE44dE562Cb90"; // Example address / DragonForge Address

  // Get the contract factory and attach to the deployed address
  const DragonForge = await ethers.getContractFactory("DragonForge");
  const dragonForgeContract = DragonForge.attach(dragonForge);

  // Call setStakingMode with the desired mode
  console.log(`Setting roll types`);

  console.log(rollTypes);
  //@ts-ignore
  const tx = await dragonForgeContract.initializeTierTypes(rollTypes);

  // Wait for the transaction to be mined
  await tx.wait();

  console.log(`Set roll types.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting roll types:", error);
    process.exit(1);
  });
