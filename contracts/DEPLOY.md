# Launching Street Splatz

This is the full launch order, written for the owner. Do the steps in order and do not skip the rehearsal.

1. Put the site on Cloudflare in preview mode, so the final site address is known.
2. Rehearse everything on Base Sepolia, a free test network.
3. Deploy the contract on Base mainnet.
4. Give the site the contract address and redeploy the site.
5. Open the sale.
6. Do one real pull before telling anyone.

Why this order: the contract stores the address of the card files, and that address is the site address plus `/meta/`. So the site address has to exist first.

## Before you start

**Tools.** You need Node 22 and this repo on your computer. At the repo root run:

```
npm run setup
npm test
```

Both must pass. Then move into the contracts folder. Every `forge` and `cast` command in this file runs from there.

```
cd contracts
alias forge="node node_modules/@foundry-rs/forge/bin.mjs"
alias cast="node node_modules/@foundry-rs/cast/bin.mjs"
```

**Final card art.** The contract stores a fingerprint of all 100 card files, and it can never be changed. The art and metadata in `assets/` must be final before step 3. Placeholder art is fine for steps 1 and 2.

**Two wallets.**

- The owner wallet controls the machine and receives the money and the royalties. Only its public address is needed for the deploy. Its key never touches this computer if you use the owner page on the site.
- The deployer wallet is a throwaway. It only pays the fee to create the contract. A few cents of ETH on Base is enough.

**Key safety.**

- Never paste a private key into chat, email or a file in this repo. Never commit one.
- Store the deployer key in Foundry's encrypted keystore. This command asks for the key and a password and keeps both out of your shell history:

```
cast wallet import splatz-deployer --interactive
```

Use it with `--account splatz-deployer`. The other way, `--private-key 0x...`, leaves the key in your shell history. Only do that with a throwaway key.

## Step 1. Put the site on Cloudflare in preview mode

In preview mode the site shows the machine and all 100 locked gumballs, the coin says The Machine opens soon, and no wallet is ever asked for anything.

1. Push this repo to GitHub.
2. In the Cloudflare dashboard go to **Workers & Pages**, select **Create application**, then **GitHub**. Sign in to GitHub if asked and pick this repo.
3. Name the project `street-splatz`. The name must match the `name` in `wrangler.jsonc`.
4. Set the build settings:

| Setting | Value |
|---|---|
| Root directory | leave empty (the repo root) |
| Build command | `npm ci && npm ci --prefix site && npm run build` |
| Deploy command | `npx wrangler deploy` |

5. Add no variables yet. Select **Save and Deploy**.
6. When it finishes, Cloudflare shows the site address. It looks like `https://street-splatz.YOUR-NAME.workers.dev`. Open it and check the machine shows in preview mode.
7. If you want your own domain, add it now under the Worker's **Settings**, **Domains & Routes**. Decide this before step 3, because the contract will point at this address.
8. Go to **Settings**, **Build**, **Build variables and secrets** and add one variable. Use the final site address with no slash at the end:

| Variable | Value |
|---|---|
| `SITE_URL` | `https://your-final-site-address` |

9. Redeploy the site. Pushing any commit to the main branch does it. You can also retry the latest build from the Worker's build history in the dashboard.
10. Check that `https://your-final-site-address/meta/1.json` opens and that the `image` line inside it starts with your site address.

From now on every push to the main branch rebuilds and redeploys the site.

## Step 2. Rehearse on Base Sepolia

Base Sepolia is a test network. The ETH on it is free and worth nothing. The point is to run the whole launch once where mistakes cost nothing.

Get free test ETH for the deployer wallet and for a phone wallet from a Base Sepolia faucet.

Set what the deploy script needs:

```
export OWNER_ADDRESS=0xYourOwnerPublicAddress
export BASE_URI=https://your-final-site-address/meta/
export PROVENANCE=$(node -p "require('../assets/provenance.json').provenance")
```

| Variable | Meaning |
|---|---|
| `OWNER_ADDRESS` | Public address of the owner wallet. |
| `BASE_URI` | The site address plus `/meta/`. It must start with `https://` (or `ipfs://`), end with a slash and have no spaces. |
| `PROVENANCE` | The fingerprint of all card files, from `assets/provenance.json`. |
| `PRICE_WEI` | Optional. A whole number of wei, not ETH. The default is `300000000000000`, which is 0.0003 ETH. |

The script stops if the owner is the zero address, the base URI is not a web address that ends with a slash, or the provenance is empty.

It also stops if `PRICE_WEI` is set to anything other than a whole number of wei between 0.000001 ETH and 0.1 ETH. Typing `0.0003` stops the script. It does not fall back to the default. To leave the price at the default, do not set `PRICE_WEI` at all (`unset PRICE_WEI`). Check the `price (wei)` line the script prints.

Dry run first. Nothing is sent:

```
forge script script/Deploy.s.sol:Deploy --rpc-url https://sepolia.base.org
```

Then deploy:

```
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://sepolia.base.org \
  --account splatz-deployer \
  --broadcast
```

The output prints `SplatzMachine deployed at: 0x...`. Save it:

```
export MACHINE=0xTheDeployedAddress
```

Publish the source code so anyone can read it. No API key is needed:

```
forge verify-contract $MACHINE src/SplatzMachine.sol:SplatzMachine \
  --chain base-sepolia --verifier sourcify

forge verify-contract $MACHINE src/SplatzMachine.sol:SplatzMachine \
  --chain base-sepolia --verifier blockscout \
  --verifier-url https://base-sepolia.blockscout.com/api/ \
  --constructor-args $(cast abi-encode "constructor(address,string,uint256,bytes32)" \
      $OWNER_ADDRESS "$BASE_URI" ${PRICE_WEI:-300000000000000} $PROVENANCE)
```

Point the site at the test contract. In Cloudflare, under **Settings**, **Build**, **Build variables and secrets**, set:

| Variable | Value |
|---|---|
| `SITE_URL` | `https://your-final-site-address` |
| `VITE_CHAIN` | `baseSepolia` |
| `VITE_CONTRACT_ADDRESS` | the Base Sepolia address you just saved |

Redeploy the site. Then rehearse all of this:

1. Open `https://your-final-site-address/admin` with the owner wallet. Connect and select **Open sale**.
2. Open the site on a phone, inside a wallet app. Drop a coin and pull a card. Check that The Peel shows a card and that the counter moves.
3. Pull a second card with **Crank again**.
4. On the owner page, select **Withdraw** and check the test ETH arrives in the owner wallet.
5. On the owner page, close the sale and check the site says The Machine is closed for now.

Fix anything that goes wrong here before moving on.

## Step 3. Deploy on Base mainnet

Only after the rehearsal works from start to finish, including a pull from a phone.

1. Check that `BASE_URI` is the final site address plus `/meta/`, and that `BASE_URI` plus `1.json` opens in a browser.
2. Check the ETH price. If 0.0003 ETH is no longer about 50 cents, set `PRICE_WEI` before you deploy, in wei (0.00025 ETH is `250000000000000`). The owner can also change the price later. If you launch at another price, also set `VITE_FIFTY_CENT_PRICE_ETH` in step 4.
3. Put a little ETH on Base in the deployer wallet. The deploy uses about 1.72 million gas, which is usually a few cents on Base.

```
export OWNER_ADDRESS=0xYourOwnerPublicAddress
export BASE_URI=https://your-final-site-address/meta/
export PROVENANCE=$(node -p "require('../assets/provenance.json').provenance")

forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://mainnet.base.org \
  --account splatz-deployer \
  --broadcast

export MACHINE=0xTheMainnetAddress

forge verify-contract $MACHINE src/SplatzMachine.sol:SplatzMachine \
  --chain base --verifier sourcify

forge verify-contract $MACHINE src/SplatzMachine.sol:SplatzMachine \
  --chain base --verifier blockscout \
  --verifier-url https://base.blockscout.com/api/ \
  --constructor-args $(cast abi-encode "constructor(address,string,uint256,bytes32)" \
      $OWNER_ADDRESS "$BASE_URI" ${PRICE_WEI:-300000000000000} $PROVENANCE)
```

Check it. This prints the price, cards left (100), sale open (false) and the pulled cards (0):

```
cast call $MACHINE "machineState()(uint256,uint256,bool,uint256)" --rpc-url https://mainnet.base.org
cast call $MACHINE "owner()(address)" --rpc-url https://mainnet.base.org
```

The sale starts closed. Nobody can buy yet.

## Step 4. Give the site the contract address and redeploy

In Cloudflare, under **Settings**, **Build**, **Build variables and secrets**, set:

| Variable | Value |
|---|---|
| `SITE_URL` | `https://your-final-site-address` |
| `VITE_CHAIN` | `base` |
| `VITE_CONTRACT_ADDRESS` | the Base mainnet address from step 3 |
| `VITE_FIFTY_CENT_PRICE_ETH` | Optional. Only if the price is not 0.0003 ETH. The price in ETH that is about 50 cents, such as `0.00025`. |

The site says "about 50 cents" next to the price only while the price on chain equals `VITE_FIFTY_CENT_PRICE_ETH` (0.0003 if you do not set it). At any other price it shows the ETH price alone and no dollar figure.

Redeploy the site. The build stops with a clear message if `VITE_CONTRACT_ADDRESS` is set and `SITE_URL` is missing, or if either value is mistyped.

Open the site. It should show 0 of 100 pulled, the contract address in the fine print and The Machine is closed for now.

## Step 5. Open the sale

Open `https://your-final-site-address/admin` with the owner wallet. Connect, check it says your wallet is the owner, and select **Open sale**. Confirm in the wallet.

The same thing from the command line, if the owner key is in the keystore (`cast wallet import splatz-owner --interactive`):

```
cast send $MACHINE "setSaleOpen(bool)" true \
  --rpc-url https://mainnet.base.org --account splatz-owner
```

## Step 6. One real pull

Before telling anyone, pull one card yourself with real money, from a phone, inside a wallet app.

1. Drop a coin and approve. It costs the price plus a network fee of well under a cent.
2. Check The Peel shows your card and the counter says 1 of 100.
3. Follow **View on OpenSea** and check the card art and traits show up. OpenSea can take a few minutes the first time.
4. On the owner page, select **Withdraw** and check the money arrives in the owner wallet.

If all four work, The Machine is live.

## Owner commands

The owner page at `/admin` covers open, close, price and withdraw. The same from the command line:

```
cast send $MACHINE "setSaleOpen(bool)" false --rpc-url https://mainnet.base.org --account splatz-owner
cast send $MACHINE "setPrice(uint256)" 350000000000000 --rpc-url https://mainnet.base.org --account splatz-owner
cast send $MACHINE "withdraw()" --rpc-url https://mainnet.base.org --account splatz-owner
cast send $MACHINE "setBaseURI(string)" "https://new-host/meta/" --rpc-url https://mainnet.base.org --account splatz-owner
```

`setBaseURI` is only for moving the card files to a new address. The new value must end with a slash. The contract refuses one that does not.

`setPrice` takes wei and refuses zero. After a price change the site drops the "about 50 cents" note by itself. To bring the note back at the new price, set `VITE_FIFTY_CENT_PRICE_ETH` to the new price in Cloudflare and redeploy the site.

Moving ownership to another wallet takes two steps, so a mistyped address cannot lose the machine:

```
cast send $MACHINE "transferOwnership(address)" 0xNewOwner --rpc-url https://mainnet.base.org --account splatz-owner
cast call $MACHINE "pendingOwner()(address)" --rpc-url https://mainnet.base.org
# then, from the new owner wallet:
cast send $MACHINE "acceptOwnership()" --rpc-url https://mainnet.base.org --account splatz-new-owner
```

Nothing changes until the new wallet accepts. Until then the old owner keeps every control, the money and the royalties, and can name a different wallet to correct a mistake.

## Local rehearsal with anvil

Anvil is a pretend chain on your own computer. From the repo root:

```
npm run build:assets
npm run anvil            # leave it running, open a second terminal
npm run deploy:local
npm run dev              # then open http://localhost:5173
```

`npm run deploy:local` runs the same deploy script as a real launch, opens the sale and tells the site where the contract is. It uses anvil's built in test accounts and no keys.

## Things to know

- Ownership can be moved but can never be given up. The move takes two steps: the owner calls `transferOwnership(address)`, then the new wallet calls `acceptOwnership()`. Royalties and withdrawals follow the current owner.
- `withdraw()` sends the whole balance to the owner. If the owner is a contract that refuses ETH, it fails and the money stays in the machine until ownership moves to a wallet that can receive it.
- The pick uses public block data. It is not verifiable randomness and a bot could cheat it. The site says so in the fine print.
- The gas a pull needs depends on which card comes out, from about 78,000 to about 126,000. The site sends every pull with a fixed limit of 200,000 so a pull cannot run out of gas. Unused gas is not charged.
- A pull must pay the exact price. If the owner changes the price while someone is at the machine, the site shows them the new price and asks again before any money moves.
- After changing the contract, run `npm run abi` at the repo root. It refreshes `contracts/abi/SplatzMachine.json` and `site/src/abi.js`. The tests fail if they are out of date.
- Card art and metadata are cached for up to a day by Cloudflare and by marketplaces. After replacing card files, expect a delay before everyone sees the new ones.
