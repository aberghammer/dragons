import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { liveRarityLevels } from "./rarityLevels";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonForge = "0x44eBE8fa260461d7F3cACf5Cf6c1dFa022fD0dc6"; // Example address / Derpy Dragons Address

  // Get the contract factory and attach to the deployed address
  const DragonForge = await ethers.getContractFactory("DragonForge");
  const dragonForgeContract = DragonForge.attach(dragonForge);

  // Call setStakingMode with the desired mode
  console.log(`Setting rarity levels`);

  console.log(liveRarityLevels);
  //@ts-ignore
  const tx = await dragonForgeContract.initializeRarityLevels(liveRarityLevels);

  // Wait for the transaction to be mined
  await tx.wait();

  console.log(`Set rarity levels.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting rarity levels:", error);
    process.exit(1);
  });
