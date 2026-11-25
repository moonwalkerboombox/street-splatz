// Build time settings. See .env.example.
import { getAddress, isAddress, parseEther } from 'viem';

const CHAINS = {
  base: {
    id: 8453, label: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org',
    explorerName: 'Basescan',
  },
  baseSepolia: {
    id: 84532, label: 'Base Sepolia', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org',
    explorerName: 'Basescan',
  },
  anvil: { id: 31337, label: 'Anvil', rpc: 'http://127.0.0.1:8545', explorer: '', explorerName: '' },
};

const env = import.meta.env;
const key = CHAINS[env.VITE_CHAIN] ? env.VITE_CHAIN : 'base';
const rawAddress = (env.VITE_CONTRACT_ADDRESS || '').trim();
const validAddress = isAddress(rawAddress, { strict: false });
if (rawAddress && !validAddress) {
  console.warn('VITE_CONTRACT_ADDRESS is not a valid address. Running in preview mode.');
}

export const chainKey = key;
export const chainInfo = CHAINS[key];
export const contractAddress = validAddress ? getAddress(rawAddress) : null;
export const preview = !contractAddress;
export const rpcOverride = (env.VITE_RPC_URL || '').trim() || null;

// The page says "about 50 cents" next to the price only while the price on chain equals this amount.
// At any other price the dollar note is left out, so the page never states a dollar figure that is wrong.
let fiftyCents = null;
try { fiftyCents = parseEther((env.VITE_FIFTY_CENT_PRICE_ETH || '0.0003').trim()); } catch {
  console.warn('VITE_FIFTY_CENT_PRICE_ETH is not an ETH amount. The dollar note is switched off.');
}
export const fiftyCentPriceWei = fiftyCents && fiftyCents > 0n ? fiftyCents : null;

export const chain = {
  id: chainInfo.id,
  name: chainInfo.label,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [chainInfo.rpc] } },
  blockExplorers: chainInfo.explorer
    ? { default: { name: chainInfo.explorerName, url: chainInfo.explorer } }
    : undefined,
};

export const txUrl = (hash) => (chainInfo.explorer ? `${chainInfo.explorer}/tx/${hash}` : null);
export const addressUrl = (addr) => (chainInfo.explorer ? `${chainInfo.explorer}/address/${addr}` : null);

// Where a collector can look at one card. OpenSea on mainnet, the explorer on testnet.
// A local anvil build shows the same links as mainnet so the rehearsal and the tests see the real page.
const likeMainnet = key === 'base' || key === 'anvil';
export function tokenLink(id) {
  if (likeMainnet) return { label: 'View on OpenSea', url: `https://opensea.io/assets/base/${contractAddress}/${id}` };
  if (key === 'baseSepolia') return { label: 'View on Basescan', url: `${chainInfo.explorer}/token/${contractAddress}?a=${id}` };
  return null;
}
export function collectionLink() {
  if (likeMainnet) return { label: 'View on OpenSea', url: `https://opensea.io/assets/base/${contractAddress}` };
  if (key === 'baseSepolia') return { label: 'View on Basescan', url: `${chainInfo.explorer}/token/${contractAddress}` };
  return null;
}
