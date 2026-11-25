# Street Splatz

Street Splatz is a website that looks like an old school gumball machine. A visitor drops a coin, pays 0.0003 ETH (about 50 cents) on Base in one transaction and gets one random NFT card from a fixed set of 100. There is no server: the site is static files on Cloudflare, and one small contract on Base does the rest.

All 100 cards are for sale. Nothing is held back. The pick uses public block data, so it is not verifiable randomness, and the site says so.

## Repo map

| Path | What it is |
|---|---|
| `assets/` | The 100 source cards: art, metadata and the provenance fingerprint. Never edited by the build. |
| `scripts/build-assets.mjs` | Turns `assets/` into the files the site serves: `site/public/img`, `site/public/meta` and `site/public/cards.json`. |
| `scripts/sync-abi.mjs` | Copies the compiled contract ABI into `site/src/abi.js` so the site and the contract cannot drift. |
| `scripts/check-build-env.mjs` | Stops `npm run build` when the settings would publish a broken site. |
| `scripts/deploy-local.mjs` | Deploys the contract to a local test chain for a rehearsal. |
| `contracts/` | The `SplatzMachine` contract, its tests and the deploy script. Foundry is installed from npm. |
| `contracts/DEPLOY.md` | The launch runbook. Start there when it is time to go live. |
| `site/` | The website (Vite and viem). `index.html` is the machine. `admin.html` is the owner page at `/admin`. |
| `site/e2e/` | End to end tests that drive the real built page against the real contract on a local chain. |
| `site/public/_headers` | Cloudflare caching and cross site rules for the card files. |
| `wrangler.jsonc` | Cloudflare Workers settings. It serves `site/dist` as static files. |
| `.github/workflows/ci.yml` | Runs every test on each push and pull request. |
| `docs/` | The build brief and the approved visual mockup. |

## Run the tests

You need Node 22. Run these at the repo root.

```
npm run setup            # one time: installs the contract and site tools
npm test                 # contract tests, then the end to end tests
```

To run one half only, use `npm run test:contracts` or `npm run test:e2e`.

The end to end tests start a local chain (anvil), deploy the contract with the real deploy script, build the site against it and drive it in Chromium with a pretend wallet. They need Playwright's Chromium once: `cd site && npx playwright install chromium`. The tests of the Cloudflare response headers also need wrangler, which `npm ci` at the repo root installs. Without it those few tests are skipped on a laptop.

## Run it locally in five commands

```
npm run setup            # 1. install everything
npm run build:assets     # 2. build the card files
npm run anvil            # 3. start a local chain. Leave it running and open a second terminal.
npm run deploy:local     # 4. deploy the machine to it and open the sale
npm run dev              # 5. open http://localhost:5173
```

To pull a card locally, your browser wallet needs the local network (RPC `http://127.0.0.1:8545`, chain ID 31337) and one of the test accounts that anvil prints when it starts. Those keys are public test keys. Never send real money to them. The owner page at `http://localhost:5173/admin.html` works with anvil's second account.

Without step 4 the site runs in preview mode: everything shows, the coin says The Machine opens soon and no wallet is ever asked for anything.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the card files and the site into `site/dist`. Reads `SITE_URL`, `VITE_CHAIN`, `VITE_CONTRACT_ADDRESS` and the optional `VITE_FIFTY_CENT_PRICE_ETH`. |
| `npm run abi` | Recompiles the contract and refreshes the ABI the site uses. Run it after any contract change. |
| `npx wrangler deploy --dry-run` | Checks the Cloudflare settings without publishing. Run `npm ci` at the root first. |

## Going live

Follow [contracts/DEPLOY.md](contracts/DEPLOY.md). It covers Cloudflare, the Base Sepolia rehearsal, the mainnet deploy, opening the sale and the first real pull, in order.
