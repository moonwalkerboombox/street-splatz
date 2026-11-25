// Wallet discovery (EIP-6963 with a window.ethereum fallback), connecting, chain switching
// and the "open this page inside a wallet app" links for phones with no wallet in the browser.
import { numberToHex } from 'viem';
import { chain, chainInfo } from './config.js';

const announced = new Map();
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const { info, provider } = e.detail || {};
    if (info?.uuid && provider) announced.set(info.uuid, { name: info.name, icon: safeIcon(info.icon), provider });
  });
}

// Wallet icons arrive as data URIs from the wallet itself. Only accept images.
const safeIcon = (icon) => (typeof icon === 'string' && /^data:image\//.test(icon) ? icon : null);

// Asks wallets to announce themselves, waits a beat and returns what turned up.
export async function discoverWallets(waitMs = 300) {
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((r) => setTimeout(r, waitMs));
  if (announced.size) return [...announced.values()];
  if (window.ethereum) return [{ name: 'Browser wallet', icon: null, provider: window.ethereum }];
  return [];
}

// Returns the connected account after making sure the wallet is on our chain.
export async function connect(provider) {
  const [account] = await provider.request({ method: 'eth_requestAccounts' });
  if (!account) throw new Error('The wallet returned no account');
  await ensureChain(provider);
  return account;
}

export async function ensureChain(provider) {
  const want = numberToHex(chain.id);
  const current = async () => Number(await provider.request({ method: 'eth_chainId' }));
  if ((await current()) === chain.id) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
  } catch (err) {
    if (err?.code === 4001) throw err;
    // Usually error 4902, the wallet does not know the chain yet. Offer to add it.
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: want,
        chainName: chainInfo.label,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [chainInfo.rpc],
        blockExplorerUrls: chainInfo.explorer ? [chainInfo.explorer] : undefined,
      }],
    });
  }
  if ((await current()) !== chain.id) {
    throw Object.assign(new Error('wrong network'), { kind: 'network' });
  }
}

// Links that reopen this page inside a wallet app's built in browser.
// NOTE: both formats need checking on a real iPhone and a real Android phone before launch.
export function walletAppLinks(href = window.location.href) {
  const url = new URL(href);
  return [
    { name: 'Coinbase Wallet', url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url.href)}` },
    { name: 'MetaMask', url: `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}` },
  ];
}

export const shortAddress = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;
