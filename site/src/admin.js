// Owner page. Reads the machine, and lets the owner wallet open or close the sale,
// set the price and withdraw. Not linked from the main page.
import { formatEther, parseEther } from 'viem';
import { abi } from './abi.js';
import * as chain from './chain.js';
import * as wallet from './wallet.js';
import { $, h } from './ui.js';
import { addressUrl, chainInfo, contractAddress, txUrl } from './config.js';

const A = { owner: null, machine: null, balance: null, session: null, busy: false };
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isOwner = () => same(A.owner, A.session?.account);

function log(text, link) {
  const first = $('adLog').firstElementChild;
  if (first?.textContent === 'Nothing yet.') first.remove();
  const time = new Date().toLocaleTimeString();
  $('adLog').prepend(h('li', null, `${time} ${text} `, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, 'View transaction') : null));
}

function render() {
  $('adNet').textContent = chainInfo.label;
  const url = contractAddress && addressUrl(contractAddress);
  $('adContract').replaceChildren(!contractAddress ? 'Not set. Add VITE_CONTRACT_ADDRESS and rebuild.' : url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, contractAddress) : contractAddress);
  $('adOwner').textContent = A.owner || '...';
  $('adBalance').textContent = A.balance == null ? '...' : `${formatEther(A.balance)} ETH`;
  $('adPrice').textContent = A.machine ? `${formatEther(A.machine.price)} ETH` : '...';
  $('adSale').textContent = A.machine ? (A.machine.saleOpen ? 'Open' : 'Closed') : '...';
  $('adLeft').textContent = A.machine ? String(A.machine.remaining) : '...';
  $('adAccount').textContent = !A.session ? 'Not connected'
    : `${A.session.account} ${isOwner() ? 'is the owner.' : 'is not the owner. The controls stay locked.'}`;
  const ok = isOwner() && !A.busy && !!A.machine;
  $('adOpen').disabled = !ok || A.machine.saleOpen;
  $('adClose').disabled = !ok || !A.machine.saleOpen;
  $('adPriceInput').disabled = !ok;
  $('adSetPrice').disabled = !ok;
  $('adWithdraw').disabled = !ok || !A.balance;
  $('adConnect').disabled = !contractAddress;
  $('adConnect').hidden = !!A.session;
}

async function refresh() {
  if (!contractAddress) return render();
  try {
    [A.owner, A.machine, A.balance] = await Promise.all([
      chain.publicClient.readContract({ address: contractAddress, abi, functionName: 'owner' }),
      chain.readMachine(),
      chain.balanceOf(contractAddress),
    ]);
  } catch (err) {
    console.warn(err);
    log(`Could not reach ${chainInfo.label}. Press Refresh to try again.`);
  }
  render();
}

async function connect() {
  const wallets = await wallet.discoverWallets();
  if (!wallets.length) return log('No wallet found in this browser.');
  const use = async (w) => {
    $('adWallets').replaceChildren();
    try {
      const account = await wallet.connect(w.provider);
      A.session = { provider: w.provider, account, walletClient: chain.walletClientFor(w.provider, account) };
      w.provider.on?.('accountsChanged', ([next]) => {
        A.session = next ? { provider: w.provider, account: next, walletClient: chain.walletClientFor(w.provider, next) } : null;
        render();
      });
      log(`Connected ${wallet.shortAddress(account)}.`);
    } catch (err) {
      console.warn(err);
      log(err?.kind === 'network' ? `The wallet is not on ${chainInfo.label}.` : 'The wallet did not connect.');
    }
    render();
  };
  if (wallets.length === 1) return use(wallets[0]);
  $('adWallets').replaceChildren(...wallets.map((w) => h('button', { type: 'button', class: 'wopt', onclick: () => use(w) },
    w.icon ? h('img', { src: w.icon, alt: '', width: 32, height: 32 }) : null, h('span', null, w.name))));
}

// Confirm, send, wait for the receipt, report, re-read.
async function act(question, done, functionName, args = []) {
  if (!isOwner() || A.busy || !window.confirm(question)) return;
  A.busy = true; render();
  let hash;
  try {
    await wallet.ensureChain(A.session.provider);
    const call = { address: contractAddress, abi, functionName, args, account: A.session.account };
    await chain.publicClient.simulateContract(call);
    hash = await A.session.walletClient.writeContract(call);
    log('Transaction sent. Waiting for it to confirm.', txUrl(hash));
    const receipt = await chain.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw Object.assign(new Error('reverted'), { kind: 'reverted' });
    log(done, txUrl(hash));
  } catch (err) {
    console.warn(err);
    log({
      rejected: 'You closed the wallet request. Nothing changed.',
      funds: 'The owner wallet does not have enough ETH for the network fee.',
      notowner: 'This wallet is not the owner.',
      reverted: 'The transaction failed on chain. Nothing changed.',
    }[chain.errorKind(err)] || 'That did not go through. Nothing changed unless a transaction shows above.', hash && txUrl(hash));
  }
  A.busy = false;
  await refresh();
}

$('adRefresh').addEventListener('click', refresh);
$('adConnect').addEventListener('click', connect);
$('adOpen').addEventListener('click', () => act('Open the sale? Anyone will be able to pull.', 'The sale is open.', 'setSaleOpen', [true]));
$('adClose').addEventListener('click', () => act('Close the sale? Nobody will be able to pull until you open it again.', 'The sale is closed.', 'setSaleOpen', [false]));
$('adWithdraw').addEventListener('click', () => act(`Withdraw ${formatEther(A.balance)} ETH to the owner wallet?`, 'Withdrawn to the owner wallet.', 'withdraw'));
$('adPriceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('adPriceInput').value.trim();
  let wei;
  try { wei = parseEther(text); } catch { wei = 0n; }
  if (!/^\d*\.?\d+$/.test(text) || wei <= 0n) return log('Enter a price in ETH, such as 0.0003.');
  act(`Set the price to ${formatEther(wei)} ETH a pull?`, `The price is now ${formatEther(wei)} ETH.`, 'setPrice', [wei]);
});

refresh();
