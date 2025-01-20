import { ethers, upgrades, run, network } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { blue, green, yellow, red, bold } from "colorette";

dotEnvConfig();

async function main() {
  console.log(blue("🚀 Deploying DragonForge Contract..."));

  const DerpyDragons = await ethers.getContractFactory("DragonForge");
  const derpyDragons = await upgrades.deployProxy(
    DerpyDragons,
    [
      "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320",
      1n, // points per hour per token
      "0x942f916C60De629C0758542d4b08Fc1356309DFB", //Dragons on ape
      "0x85206d9edbc0fbc405a60b7345ea6994a5826a70", //DinnerParty
      "0xF73B531EFacf13695Fa4a942d7b089Ab8Ad494Ac", //Dwaginz - deploy first...
      "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506", //Provider
    ],
    {
      initializer: "initialize",
      kind: "uups", // Specifies UUPS upgradeable pattern
      txOverrides: {
        gasLimit: 5000000,
      },
    }
  );
  await derpyDragons.waitForDeployment();

  console.log(
    green(
      `DerpyDragons Contract deployed at Proxy Address: ${bold(
        await derpyDragons.getAddress()
      )}`
    )
  );
}

main().catch((error) => {
  console.error(red("❌ Error deploying DerpyDragons:"), error);
  process.exitCode = 1;
});
