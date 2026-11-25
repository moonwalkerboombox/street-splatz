// Everything that talks to the chain. Reads use a public RPC and need no wallet.
import {
  BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError,
  createPublicClient, createWalletClient, custom, fallback, getAbiItem, http, parseEventLogs, zeroAddress,
} from 'viem';
import { abi } from './abi.js';
import { chain, chainInfo, chainKey, contractAddress, rpcOverride } from './config.js';

const opts = { timeout: 10_000, retryCount: 1 };
export const publicClient = createPublicClient({
  chain,
  // Your own RPC is tried first and the public one stays as backup. A local anvil has no backup.
  transport: rpcOverride
    ? (chainKey === 'anvil' ? http(rpcOverride, opts) : fallback([http(rpcOverride, opts), http(chainInfo.rpc, opts)]))
    : http(chainInfo.rpc, opts),
  pollingInterval: 1_500,
});

export const walletClientFor = (provider, account) =>
  createWalletClient({ account, chain, transport: custom(provider) });

const contract = { address: contractAddress, abi };
const sameAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase();

// One call gives the whole picture. Bit n of the bitmap is set when card n has been pulled.
export async function readMachine() {
  const [price, remaining, saleOpen, bitmap] = await publicClient.readContract({ ...contract, functionName: 'machineState' });
  return { price, remaining: Number(remaining), saleOpen, bitmap };
}
export const isPulled = (machine, id) => ((machine.bitmap >> BigInt(id)) & 1n) === 1n;

// The latest pulls, newest first, from one bounded getLogs call (about five hours of Base blocks).
// Public RPCs cap the block range, so this never tries to scan the whole history.
const RECENT_BLOCKS = 9_000n;
export async function recentPulls(limit = 8) {
  // cacheTime 0 so a pull that just landed is inside the range and shows up right away.
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  const logs = await publicClient.getLogs({
    address: contractAddress,
    event: getAbiItem({ abi, name: 'Pulled' }),
    fromBlock: latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : 0n,
    toBlock: latest,
  });
  return logs.slice(-limit).reverse().map((l) => ({ to: l.args.to, id: Number(l.args.tokenId) }));
}

export const balanceOf = (address) => publicClient.getBalance({ address });

// Rough network fee for one pull. It leaves out the small L1 data fee, so the label says estimate.
export async function estimatePullFee(account, price) {
  const [gas, fees] = await Promise.all([
    publicClient.estimateContractGas({ ...contract, functionName: 'pull', value: price, account }),
    publicClient.estimateFeesPerGas(),
  ]);
  return gas * (fees.maxFeePerGas ?? fees.gasPrice);
}

// The gas a pull needs depends on which card comes out, and that is only settled in the block the
// transaction lands in. A wallet's own estimate is made earlier, for a different card, and can come up
// short, which would fail the pull and still cost the fee. So the page sets a fixed limit with room to
// spare. The most a pull has ever measured is about 126,300 gas. Unused gas is never charged.
export const PULL_GAS_LIMIT = 200_000n;

// Sends pull() and returns the card number read from the mined receipt. Never guesses.
// shouldSend is asked right before the wallet is opened. If it says no, nothing is sent.
export async function pull({ walletClient, account, price, onSent, shouldSend }) {
  // Dry run first so a revert comes back with its name instead of a vague wallet error.
  await publicClient.simulateContract({ ...contract, functionName: 'pull', value: price, account });
  if (shouldSend && !shouldSend()) throw Object.assign(new Error('stopped before sending'), { kind: 'stopped' });
  const hash = await walletClient.writeContract({ ...contract, functionName: 'pull', value: price, account, chain, gas: PULL_GAS_LIMIT });
  onSent?.(hash);
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash });
  } catch (cause) {
    throw Object.assign(new Error('lost track of transaction'), { kind: 'lost', hash, cause });
  }
  if (receipt.status !== 'success') throw Object.assign(new Error('transaction reverted'), { kind: 'reverted', hash, price });
  const id = cardFromReceipt(receipt, account);
  if (!id) throw Object.assign(new Error('no Pulled event in receipt'), { kind: 'unread', hash });
  return { id, hash };
}

// Our Pulled event for this buyer, or failing that the ERC-721 mint Transfer from our contract.
export function cardFromReceipt(receipt, account) {
  const ours = receipt.logs.filter((l) => sameAddress(l.address, contractAddress));
  const pulled = parseEventLogs({ abi, eventName: 'Pulled', logs: ours }).find((l) => sameAddress(l.args.to, account));
  if (pulled) return Number(pulled.args.tokenId);
  const minted = parseEventLogs({ abi, eventName: 'Transfer', logs: ours })
    .find((l) => l.args.from === zeroAddress && sameAddress(l.args.to, account));
  return minted ? Number(minted.args.tokenId) : null;
}

// Boils any failure down to one of a few kinds the page knows how to explain.
// rejected, funds, price, soldout, closed, reverted, lost, unread, notowner, stopped, failed.
export function errorKind(err) {
  if (err?.kind) return err.kind;
  const find = (type) => (err instanceof BaseError ? err.walk((e) => e instanceof type) : null);
  const text = `${err?.shortMessage || ''} ${err?.details || ''} ${err?.message || ''}`.toLowerCase();
  if (find(UserRejectedRequestError) || err?.code === 4001 || /user (rejected|denied|cancel)/.test(text)) return 'rejected';
  const revert = find(ContractFunctionRevertedError);
  const name = revert?.data?.errorName;
  if (name === 'WrongPrice') return 'price';
  if (name === 'SoldOut') return 'soldout';
  if (name === 'SaleClosed') return 'closed';
  if (name === 'OwnableUnauthorizedAccount') return 'notowner';
  if (find(InsufficientFundsError) || /insufficient (funds|balance)/.test(text)) return 'funds';
  return 'failed';
}
