import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { liveRarityLevels } from "./rarityLevels";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonForge = "0x8F6708d8d476917D8A7E91f8087dE44dE562Cb90"; // Example address / Derpy Dragons Address

  // Get the contract factory and attach to the deployed address
  const DragonForge = await ethers.getContractFactory("DragonForge");
  const dragonForgeContract = DragonForge.attach(dragonForge);

  // Call setStakingMode with the desired mode

  //@ts-ignore
  const tx_checkin = await dragonForgeContract.setDailyBonus(24);

  // Wait for the transaction to be mined
  await tx_checkin.wait();

  console.log(`Set daily bonus.`);

  // set dinner party discount

  const tx_dinner_party = await dragonForgeContract.setDinnerPartyDiscount(10);

  await tx_dinner_party.wait();

  console.log(`Set dinner party discount.`);

  const tx_set_dinner_party_daily_bonus =
    await dragonForgeContract.setDinnerPartyDailyBonus(24);

  await tx_set_dinner_party_daily_bonus.wait();

  console.log(`Set dinner party daily bonus.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting bonus:", error);
    process.exit(1);
  });
