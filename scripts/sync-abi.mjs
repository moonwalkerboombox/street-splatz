// Copies the compiled contract ABI into the site so the two cannot drift.
// Source of truth: contracts/abi/SplatzMachine.json (written by "npm run abi" in contracts/).
// Writes site/src/abi.js. With --check it writes nothing and fails if anything is out of date.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const abiPath = join(root, 'contracts', 'abi', 'SplatzMachine.json');
const sitePath = join(root, 'site', 'src', 'abi.js');
const artifactPath = join(root, 'contracts', 'out', 'SplatzMachine.sol', 'SplatzMachine.json');

const abi = JSON.parse(readFileSync(abiPath, 'utf8'));
const wanted = `// GENERATED FILE. Do not edit by hand.
// Copied from contracts/abi/SplatzMachine.json by scripts/sync-abi.mjs. Run "npm run abi" at the repo root.
export const abi = ${JSON.stringify(abi, null, 2)};
`;

if (!check) {
  writeFileSync(sitePath, wanted);
  console.log(`site/src/abi.js written (${abi.length} entries)`);
} else {
  const problems = [];
  // If the contract has been compiled, the committed ABI must match the compiler output too.
  if (existsSync(artifactPath)) {
    const built = JSON.parse(readFileSync(artifactPath, 'utf8')).abi;
    if (JSON.stringify(built) !== JSON.stringify(abi)) problems.push('contracts/abi/SplatzMachine.json does not match the compiled contract');
  }
  if (!existsSync(sitePath) || readFileSync(sitePath, 'utf8') !== wanted) problems.push('site/src/abi.js does not match contracts/abi/SplatzMachine.json');
  if (problems.length) {
    console.error(problems.join('\n') + '\nRun "npm run abi" at the repo root and commit the result.');
    process.exit(1);
  }
  console.log('ABI is in sync');
}
