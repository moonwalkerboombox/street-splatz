// Copies the ABI array out of the forge build output into abi/SplatzMachine.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = JSON.parse(readFileSync(join(root, "out/SplatzMachine.sol/SplatzMachine.json"), "utf8"));
mkdirSync(join(root, "abi"), { recursive: true });
writeFileSync(join(root, "abi/SplatzMachine.json"), JSON.stringify(artifact.abi, null, 2) + "\n");
console.log(`abi/SplatzMachine.json written (${artifact.abi.length} entries)`);
