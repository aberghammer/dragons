import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { rarityLevels } from "../test/rarityLevels";
dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)
  const derpyDragonsAddress = "0xcEfD3FabE761b87D3629a6649753bb911F7C49bb"; // Example address

  // Get the contract factory and attach to the deployed address
  const DerpyDragons = await ethers.getContractFactory("DragonsLair");
  const derpyDragonsContract = DerpyDragons.attach(derpyDragonsAddress);

  // Call setStakingMode with the desired mode
  console.log(`Setting rarity levels`);
  //@ts-ignore
  const tx = await derpyDragonsContract.initializeRarityLevels(rarityLevels);

  // Wait for the transaction to be mined
  await tx.wait();

  console.log(`Set rarity levels.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting staking mode:", error);
    process.exit(1);
  });
