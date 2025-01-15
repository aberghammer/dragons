import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { rollTypes } from "./rolltype";

dotEnvConfig();

async function main() {
  // Contract deployment address (replace with your deployed contract's address)

  const dragonsLair = "0xFc4F9A76F5456888Fa13B41Eb4e0bcE26F6B1e9d"; // Example address / DragonsLair Address

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
