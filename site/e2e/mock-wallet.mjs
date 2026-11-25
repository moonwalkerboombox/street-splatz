// A pretend browser wallet for the tests. It runs inside the page.
// It is an EIP-1193 provider announced through EIP-6963 (or as window.ethereum with legacy: true).
// Chain reads and transactions are forwarded to anvil, which signs for its unlocked dev accounts.
// Switches, readable and changeable from a test through window.__mockWallet:
//   rejectConnect  the user closes the connect request
//   rejectTx       the user closes the transaction request
//   holdTx         the transaction request stays open (like a wallet popup) until holdTx is set false
//   wrongChain     the wallet starts on Ethereum mainnet. onSwitch says what a switch request does:
//                  'ok' switches, 'unknown' fails with 4902 until the chain is added, 'reject' is a user refusal
export function installMockWallet(cfg) {
  const realChain = '0x' + cfg.chainId.toString(16);
  const state = {
    account: cfg.account,
    chainId: cfg.wrongChain ? '0x1' : realChain,
    onSwitch: cfg.onSwitch || 'ok',
    rejectConnect: !!cfg.rejectConnect,
    rejectTx: !!cfg.rejectTx,
    holdTx: !!cfg.holdTx,
    connected: false,
    known: !cfg.wrongChain || cfg.onSwitch !== 'unknown',
    requests: [],
    sent: [],
  };
  const listeners = {};
  const emit = (name, value) => (listeners[name] || []).forEach((fn) => fn(value));
  const fail = (code, message) => Object.assign(new Error(message), { code });
  let id = 1;
  const forward = async (method, params) => {
    const res = await fetch(cfg.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params: params || [] }),
    });
    const json = await res.json();
    if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data });
    return json.result;
  };

  const provider = {
    isMockWallet: true,
    on(name, fn) { (listeners[name] ||= []).push(fn); return provider; },
    removeListener(name, fn) { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); return provider; },
    async request({ method, params }) {
      state.requests.push(method);
      switch (method) {
        case 'eth_requestAccounts':
          if (state.rejectConnect) throw fail(4001, 'User rejected the request.');
          state.connected = true;
          return [state.account];
        case 'eth_accounts':
          return state.connected ? [state.account] : [];
        case 'eth_chainId':
          return state.chainId;
        case 'wallet_switchEthereumChain':
          if (state.onSwitch === 'reject') throw fail(4001, 'User rejected the request.');
          if (params[0].chainId !== realChain || !state.known) throw fail(4902, 'Unrecognized chain ID.');
          state.chainId = realChain;
          emit('chainChanged', realChain);
          return null;
        case 'wallet_addEthereumChain':
          if (state.onSwitch === 'reject') throw fail(4001, 'User rejected the request.');
          if (params[0].chainId !== realChain) throw fail(-32602, 'Unsupported chain.');
          state.known = true;
          state.chainId = realChain;
          emit('chainChanged', realChain);
          return null;
        case 'eth_sendTransaction': {
          if (state.rejectTx) throw fail(4001, 'User rejected the request.');
          while (state.holdTx) await new Promise((r) => setTimeout(r, 25));
          if (state.rejectTx) throw fail(4001, 'User rejected the request.');
          if (state.chainId !== realChain) throw fail(4901, 'The wallet is on another chain.');
          const hash = await forward(method, params);
          state.sent.push(hash);
          return hash;
        }
        default:
          if (!method.startsWith('eth_') && !method.startsWith('net_')) throw fail(4200, `Unsupported method ${method}`);
          return forward(method, params);
      }
    },
  };
  state.emit = emit;
  window.__mockWallet = state;

  if (cfg.legacy) { window.ethereum = provider; return; }
  const detail = Object.freeze({
    info: Object.freeze({
      uuid: '5d0f8c5e-1c1b-4f0e-9a51-3f3f0e2a7c11',
      name: cfg.name || 'Mock Wallet',
      icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2214%22 fill=%22%231a56ff%22/%3E%3C/svg%3E',
      rdns: 'test.streetsplatz.mockwallet',
    }),
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}
