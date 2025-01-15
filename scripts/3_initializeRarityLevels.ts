import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { liveRarityLevels } from "./rarityLevels";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonsLair = "0xe59BED48c7B71178A7f43e7d25AaAD99fdA17b76"; // Example address / Derpy Dragons Address

  // Get the contract factory and attach to the deployed address
  const DragonsLair = await ethers.getContractFactory("DragonsLair");
  const dragonsLairContract = DragonsLair.attach(dragonsLair);

  // Call setStakingMode with the desired mode
  console.log(`Setting rarity levels`);

  console.log(liveRarityLevels);
  //@ts-ignore
  const tx = await dragonsLairContract.initializeRarityLevels(liveRarityLevels);

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
