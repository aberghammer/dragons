import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { liveRarityLevels } from "./rarityLevels";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonForge = "0xbB04f653f5b5c0a9566f53C2CbC12aE395740f11"; // Example address / Derpy Dragons Address

  // Get the contract factory and attach to the deployed address
  const DragonForge = await ethers.getContractFactory("DragonForge");
  const dragonForgeContract = DragonForge.attach(dragonForge);

  // Call setStakingMode with the desired mode

  //@ts-ignore
  const tx_checkin = await dragonForgeContract.setStakingMode(true);

  // Wait for the transaction to be mined
  await tx_checkin.wait();

  console.log(`Set staking.`);

  // set dinner party discount
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting bonus:", error);
    process.exit(1);
  });
