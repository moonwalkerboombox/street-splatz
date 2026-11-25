# Street Splatz Build Brief v2

Refined plan dated Nov. 25, 2026. It replaces the first brief. Hand this file, the mockup (gumball-manifold.html) and street-splatz-100.zip to the build session.

## What It Is

A website that looks like an old school gumball machine. A visitor drops a coin, pays about 50 cents in ETH on Base and gets one random card from the 100 Street Splatz that already exist. That is the whole product. There is no game, no roadmap and no promise of future value.

## What Changed From v1 and Why

| v1 | v2 | Reason |
|---|---|---|
| Manifold Studio claim and widget | One small contract the project owns | Manifold adds a flat fee of 0.0005 ETH per mint on top of the price. A 50 cent pull would cost the buyer about $1.15 and most of it would go to Manifold. Manifold also mints in a fixed order, so the pull would not be random. The widget snippet in v1 no longer exists (the script URL returns 404). |
| Shuffle the deck before upload | Contract picks from the cards left at the moment of each pull | A pre shuffled order is public before the sale. Anyone could read ahead and wait for a Street Legend. |
| Replit hosting | Cloudflare free static hosting from a GitHub repo | Free, no server, deploys on every push. |
| 0.0002 ETH | 0.0003 ETH, adjustable by the owner | ETH is near $1,650 today. 0.0002 ETH is only 33 cents. 0.0003 ETH is about 50 cents. |
| Manifold IPFS | Art and metadata served from the same Cloudflare site, with a fingerprint of all files stored in the contract | Zero extra accounts. Can move to permanent storage later without a new contract. |
| Game section and roadmap | Removed | Simpler, and it removes any hint of promised future value. |
| Quantity selector, fake progress steps, fake ticker | Removed | One coin, one gumball. Every step shown is a real step. |
| 5 random holdback slots | 5 named cards set aside at deploy, none of them Street Legends | Lets the site truthfully say all four Street Legends are in the machine. |

## The Stack

1. **One smart contract on Base.** About 100 lines on top of the audited OpenZeppelin ERC-721 library. Token number equals card number, 1 to 100.
2. **One static site.** The existing mockup, trimmed, built with Vite and one wallet library (viem). No framework and no backend.
3. **GitHub.** One free public repo. Tests run free on every push.
4. **Cloudflare.** Free static hosting connected to the repo. The 100 PNGs and 100 metadata files ship as plain files on the same site.

Accounts needed are GitHub, Cloudflare and one project wallet. Not needed are Manifold, Replit, Pinata, thirdweb, Reown, Alchemy or any API key.

## How a Pull Works

1. The page reads the machine state from the contract with no wallet needed. It shows how many are pulled, the gallery and a live odds table by rarity tier.
2. The visitor taps the coin and connects a wallet. On a phone with no wallet extension the page shows links to open the site inside Coinbase Wallet or MetaMask.
3. The visitor approves one transaction for exactly the current price.
4. The contract picks one card from those left, mints it to the buyer and records it. No card can repeat.
5. The page reads the minted card number from the confirmed transaction and plays The Peel with the real card art, name, rarity and stats.
6. At 100 pulled the glass is empty, a Sold Out stamp shows and the coin becomes a View on OpenSea link.

## Contract Rules

- Supply is hard capped at 100. Five named cards go to the owner at deploy. The other 95 are for sale.
- `pull()` takes exactly the current price, picks from the remaining pool and mints. It makes no outside calls.
- Owner can open or close the sale, set the price, set the metadata address and withdraw proceeds. Nothing else.
- Giving up ownership is disabled so funds can never get stuck.
- A fingerprint (hash) of all 200 art and metadata files is stored permanently in the contract so any future host can be checked against it.
- 7% royalty info is included because it is three lines. Marketplaces treat it as optional. Plan on zero.
- No per wallet cap. It does not stop bots and it slows a 95 card sell out.

## Honest Randomness

The contract picks using public block data. This is cheap and instant but it is not verifiable randomness. A person with a script could cheat it and take rare cards early. For a 50 cent proof of concept this is the right trade, as long as the site says so plainly.

Site wording to use. "The machine picks from the cards left using public block data. This is not verifiable randomness and a bot could cheat it. Every pull costs the same. No promise of value."

Never say provably fair, unpredictable or tamper proof.

If cheating ever matters, a later contract can use Pyth Entropy for about 2.5 cents per pull. The card would then arrive a few seconds after payment.

## Costs

| Item | Cost |
|---|---|
| Hosting, repo, tests | $0 per month |
| Contract deploy on Base | About 3 cents at current gas. Budget 30 cents. |
| Each pull, paid by buyer | 0.0003 ETH plus under 1 cent of gas |
| Platform fee | None |
| Optional custom domain | About $10 per year |
| Wallet funding to launch | About $5 of ETH on Base covers everything |

Gross if all 95 sell is about 0.0285 ETH, or roughly $47.

## Build Order

1. **Repo and assets.** Create the repo layout. Copy the 100 cards in untouched. A script checks there are exactly 100 cards in a 4, 23, 55, 18 rarity split, writes site ready image and metadata files and writes the fingerprint.
2. **Contract and tests.** Write the contract with Foundry. Tests cover a full mint out with no repeats, exact price, sold out, closed sale, owner controls, withdraw and the five set aside cards.
3. **Site.** Port the mockup. Strip the game section, roadmap, Manifold block, quantity selector, fake ticker, fake wallet address and the hardcoded 47. Wire the real wallet flow, live counter, gallery, odds table, The Peel and sold out state. Add a small owner page for open or close sale, set price and withdraw.
4. **Automated end to end test.** A local test chain plus a scripted browser pulls cards through the real page, including a full sell out.
5. **Cloudflare.** Connect the repo and confirm the final site address. This comes before the contract deploy because the contract stores the metadata address.
6. **Base Sepolia rehearsal.** Deploy with free test ETH. Verify the code on Sourcify and Blockscout. Pull from a desktop wallet and from a real phone. Check the card shows correctly in the wallet.
7. **Base mainnet.** Deploy with the same script. Open the sale. Do one real paid pull and check it on OpenSea before telling anyone.

## What Only You Can Do

- Create an empty GitHub repo and start a session on it.
- Create a free Cloudflare account and approve its GitHub connection for that one repo.
- Create the project wallet. Write the seed phrase on paper. Never paste it or a private key into chat, the repo or Cloudflare. Share only the public address.
- Get free test ETH from a Base Sepolia faucet, then later about $5 of real ETH on Base.
- Test a pull on your own phone during the rehearsal.
- Approve final site copy.

## Decisions I Made That You Can Overrule

- **The machine hands out your 100 finished cards.** It does not draw new art at pull time. Generating art inside the contract is possible but it is far more code, it retires the cards you already have and the result can never be fixed after launch.
- **Simple pick with plain disclosure** instead of paid verifiable randomness.
- **0.0003 ETH** with an owner price control so you can track 50 cents as ETH moves.
- **Five set aside cards are not Street Legends.** Tell me which five you want. The Street Legends are cards 16, 17, 56 and 98.
- **Art hosted on the project site at launch.** The site will say art is hosted by the project. Moving to permanent storage is a named follow up.
- **Free Cloudflare address at launch.** A custom domain makes the card links more stable and is the only spend worth considering.

## Known Limits

- A phone visitor with no wallet app and no ETH on Base cannot finish a pull. Card payment services have minimums of $1 to $5, above the price. Realistic buyers already hold ETH on Base. Passkey wallet sign in is a possible second phase.
- Royalties are optional on marketplaces.
- The contract is small custom code and will not be audited. Funds at risk top out near $47. The full sell out tests are the safeguard.
- A paid random pull can resemble a loot box. The odds table, equal price, no buyback and no value language keep exposure low. This is not legal advice. Get a quick opinion before promoting beyond friends.
- Base has not launched a network token as far as could be found. Drop that note from v1.

## To Recheck During the Build

- Measured gas for deploy and pull.
- That the free Cloudflare address serves the metadata files as JSON and that the public Base RPC answers from the browser.
- Wallet app deep links on one iPhone and one Android phone.
- Whether OpenSea picks up the new contract on its own.
- ETH price on launch day before setting the price.

## Brand Guardrails

Say "100 only" and "Genesis Drop." Do not say art is generated live. Do not mention a game, a roadmap, winning or jackpots. Keep the vocabulary. Pull a Splatz, Drop the Coin, The Peel, Fresh Drop, Street Legend, Block Hitter, Pavement Card. Keep AP style.
