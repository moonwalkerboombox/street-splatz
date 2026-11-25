// Direct line to the anvil chain for test setup and for checking what really happened on chain.
// Anvil's dev accounts are unlocked, so eth_sendTransaction works with no keys anywhere in this repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, decodeErrorResult, encodeFunctionData, http, numberToHex, parseEventLogs } from 'viem';
import { abi } from '../src/abi.js';
import { CHAIN_ID, RPC_URL } from './ports.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const STATE_FILE = join(here, '..', '.e2e', 'state.json');
export const readState = () => JSON.parse(readFileSync(STATE_FILE, 'utf8'));
export const writeState = (state) => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

let nextId = 1;
export async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const json = await res.json();
  if (json.error) throw Object.assign(new Error(`${method}: ${json.error.message}`), { code: json.error.code, data: json.error.data });
  return json.result;
}

export const client = createPublicClient({
  chain: { id: CHAIN_ID, name: 'Anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } },
  transport: http(RPC_URL),
});

export const machineAddress = () => readState().address;
export const read = (functionName, args = []) => client.readContract({ address: machineAddress(), abi, functionName, args });

// Sends a contract call from an unlocked anvil account and returns the mined receipt.
export async function send(from, functionName, args = [], value = 0n) {
  const hash = await rpc('eth_sendTransaction', [{
    from, to: machineAddress(), data: encodeFunctionData({ abi, functionName, args }), value: numberToHex(value),
    // A fixed limit. The gas a pull needs depends on the card picked, so a node's estimate can come up short.
    gas: numberToHex(300_000),
  }]);
  const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 50 });
  if (receipt.status !== 'success') {
    const tx = await client.getTransaction({ hash });
    throw new Error(`${functionName} reverted: gas limit ${tx.gas}, used ${receipt.gasUsed}, block ${receipt.blockNumber}`);
  }
  return receipt;
}

// One pull straight on chain, skipping the site. Returns the card number.
export async function pullDirect(from) {
  const receipt = await send(from, 'pull', [], await read('price'));
  return Number(parseEventLogs({ abi, eventName: 'Pulled', logs: receipt.logs })[0].args.tokenId);
}

// Name of the custom error a call would revert with, or null if it would succeed.
export async function revertName(from, functionName, args = [], value = 0n) {
  try {
    await rpc('eth_call', [{ from, to: machineAddress(), data: encodeFunctionData({ abi, functionName, args }), value: numberToHex(value) }, 'latest']);
    return null;
  } catch (err) {
    try { return decodeErrorResult({ abi, data: err.data }).errorName; } catch { return `unknown: ${err.message}`; }
  }
}

// Card numbers a wallet holds, found by asking ownerOf for every pulled card.
export async function cardsOwnedBy(owner) {
  const [, , , bitmap] = await read('machineState');
  const ids = [];
  for (let id = 1; id <= 100; id++) {
    if (((bitmap >> BigInt(id)) & 1n) === 1n && (await read('ownerOf', [BigInt(id)])).toLowerCase() === owner.toLowerCase()) ids.push(id);
  }
  return ids;
}

// Puts the chain back to "just deployed, sale open, nothing pulled". A snapshot can be used once, so take a new one.
export async function rewind() {
  const state = readState();
  if (!(await rpc('evm_revert', [state.snapshot]))) throw new Error('could not rewind the chain');
  state.snapshot = await rpc('evm_snapshot');
  writeState(state);
}
