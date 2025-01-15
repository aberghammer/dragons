import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { rollTypes } from "./rolltype";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonsLair = "0x3CCD515560BBEd8432F8ce970c7f009fd86076bE"; // Example address / DragonsLair Address

  // Get the contract factory and attach to the deployed address
  const DragonsLair = await ethers.getContractFactory("DragonsLair");
  const dragonsLairContract = DragonsLair.attach(dragonsLair);

  // Call setStakingMode with the desired mode
  console.log(`Setting roll types`);

  console.log(rollTypes);
  //@ts-ignore
  const tx = await dragonsLairContract.initializeRollTypes(rollTypes);

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
