// Local rehearsal helper. With anvil already running ("npm run anvil"), this deploys the machine
// with the real deploy script, opens the sale and writes site/.env.local so "npm run dev" finds it.
// It only ever talks to a chain on this computer and uses anvil's unlocked test accounts. No keys.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = join(root, 'contracts');
const RPC = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(`${RPC}/`)) throw new Error('deploy-local only talks to a chain on this computer');

const env = { ...process.env };
delete env.TARGET_TOOL;
const tool = (name, args, extraEnv = {}) => execFileSync(process.execPath, [join(contracts, 'node_modules', '@foundry-rs', name, 'bin.mjs'), ...args], {
  cwd: contracts, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...env, ...extraEnv },
});

let accounts;
try {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_accounts', params: [] }) });
  accounts = (await res.json()).result;
} catch {
  throw new Error(`No chain answered at ${RPC}. Start one first with "npm run anvil" in another terminal.`);
}
const [deployer, owner] = accounts;

tool('forge', ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', RPC, '--broadcast', '--unlocked', '--sender', deployer], {
  OWNER_ADDRESS: owner,
  BASE_URI: `${SITE_URL}/meta/`,
  PROVENANCE: JSON.parse(readFileSync(join(root, 'assets', 'provenance.json'), 'utf8')).provenance,
});
const address = JSON.parse(readFileSync(join(contracts, 'broadcast', 'Deploy.s.sol', '31337', 'run-latest.json'), 'utf8')).receipts[0].contractAddress;
tool('cast', ['send', address, 'setSaleOpen(bool)', 'true', '--rpc-url', RPC, '--unlocked', '--from', owner]);

writeFileSync(join(root, 'site', '.env.local'), `# Written by scripts/deploy-local.mjs. Safe to delete.\nVITE_CHAIN=anvil\nVITE_CONTRACT_ADDRESS=${address}\nVITE_RPC_URL=${RPC}\n`);
console.log(`SplatzMachine is at ${address} on ${RPC} and the sale is open.`);
console.log(`Owner (anvil account 1): ${owner}`);
console.log('site/.env.local now points the site at it. Next: npm run dev');
