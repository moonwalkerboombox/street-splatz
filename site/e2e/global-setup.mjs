// Runs once before the tests: start anvil, deploy the real contract with the real deploy script,
// open the sale, build the site (once pointed at the contract, once in preview mode) and serve both.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpc, send, writeState } from './chain.mjs';
import { ANVIL_PORT, CHAIN_ID, LIVE_PORT, LIVE_URL, PREVIEW_PORT, RPC_URL } from './ports.mjs';
import { serve } from './static-server.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(site, '..');
const contracts = join(repo, 'contracts');
const foundry = (tool) => join(contracts, 'node_modules', '@foundry-rs', tool, 'bin.mjs');
// The Foundry wrappers pick their tool from this variable if it is set, so never pass one along.
const cleanEnv = (extra = {}) => { const env = { ...process.env, ...extra }; delete env.TARGET_TOOL; return env; };

async function waitForAnvil() {
  for (let i = 0; i < 100; i++) {
    try { if (Number(await rpc('eth_chainId')) === CHAIN_ID) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`anvil did not start on port ${ANVIL_PORT}`);
}

function buildSite(outDir, env) {
  execFileSync(process.execPath, [join(site, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: site, stdio: 'inherit', env: cleanEnv({ VITE_CHAIN: 'anvil', VITE_RPC_URL: RPC_URL, VITE_SITE_URL: LIVE_URL, ...env }),
  });
}

export default async function globalSetup() {
  for (const need of [foundry('anvil'), join(site, 'public', 'cards.json'), join(repo, 'assets', 'provenance.json')]) {
    if (!existsSync(need)) throw new Error(`${need} is missing. Run "npm run setup" and "npm run build:assets" at the repo root first.`);
  }
  mkdirSync(join(site, '.e2e'), { recursive: true });

  const anvil = spawn(process.execPath, [foundry('anvil'), '--port', String(ANVIL_PORT), '--silent'], { env: cleanEnv(), stdio: ['ignore', 'inherit', 'inherit'] });
  const servers = [];
  const teardown = async () => {
    anvil.kill('SIGTERM');
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  };

  try {
    await waitForAnvil();
    const accounts = await rpc('eth_accounts');
    const [deployer, owner] = accounts;

    // The same script a real launch uses. The owner is a different account from the deployer, as recommended.
    execFileSync(process.execPath, [
      foundry('forge'), 'script', 'script/Deploy.s.sol:Deploy', '--rpc-url', RPC_URL, '--broadcast', '--unlocked', '--sender', deployer,
    ], {
      cwd: contracts, stdio: ['ignore', 'pipe', 'inherit'],
      env: cleanEnv({
        OWNER_ADDRESS: owner,
        BASE_URI: `${LIVE_URL}/meta/`,
        PROVENANCE: JSON.parse(readFileSync(join(repo, 'assets', 'provenance.json'), 'utf8')).provenance,
      }),
    });
    const run = JSON.parse(readFileSync(join(contracts, 'broadcast', 'Deploy.s.sol', String(CHAIN_ID), 'run-latest.json'), 'utf8'));
    const address = run.receipts[0].contractAddress;
    if (!address) throw new Error('deploy script did not report a contract address');
    const deployGas = Number(run.receipts[0].gasUsed);

    writeState({ address, accounts, deployGas, snapshot: null });
    await send(owner, 'setSaleOpen', [true]);
    writeState({ address, accounts, deployGas, snapshot: await rpc('evm_snapshot') });

    buildSite('.e2e/live', { VITE_CONTRACT_ADDRESS: address });
    buildSite('.e2e/preview', { VITE_CONTRACT_ADDRESS: '' });
    servers.push(await serve(join(site, '.e2e', 'live'), LIVE_PORT));
    servers.push(await serve(join(site, '.e2e', 'preview'), PREVIEW_PORT));
    console.log(`e2e: SplatzMachine at ${address} on anvil ${RPC_URL} (deploy gas ${deployGas}), site at ${LIVE_URL}`);
  } catch (err) {
    await teardown();
    throw err;
  }
  return teardown;
}
