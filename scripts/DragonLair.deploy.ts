import { ethers, upgrades, run, network } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { blue, green, yellow, red, bold } from "colorette";

dotEnvConfig();

async function main() {
  console.log(blue("🚀 Deploying DragonsLair Contract..."));

  const DerpyDragons = await ethers.getContractFactory("DragonsLair");
  const derpyDragons = await upgrades.deployProxy(
    DerpyDragons,
    [
      "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320",
      10000n,
      "0x095a8aa22cf86e222fbc0f829ae9d0831d8c52bc", //R`s on ape
      "0x25402FfD2e63844Bc649e2d551723657cC389FDA",
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
