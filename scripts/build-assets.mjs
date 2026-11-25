// Turns the untouched card set in assets/ into the files the site serves.
// Writes site/public/img/NNN.png, site/public/meta/N.json, site/public/meta/collection.json,
// site/public/cards.json and assets/provenance.json. Fails if the set is not exactly
// 100 cards in a 4 / 23 / 55 / 18 rarity split.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const TOTAL = 100;
const EXPECTED = { 'Street Legend': 4, 'Block Hitter': 23, 'Fresh Drop': 55, 'Pavement Card': 18 };
const FLAVOR_HEX = {
  Cherry: '#E31E24', Blueberry: '#1A56FF', Vanilla: '#F0EAD6', Licorice: '#262626',
  Grape: '#7B3FE4', Lime: '#5FD11A', Orange: '#FF8A1E', Bubblegum: '#FF5CAD',
};
const STATS = ['Jaw Smash', 'Sugar Bomb', 'Pucker Blast', 'Flavor Drip', 'Gutter Splat'];
const pad = (n) => String(n).padStart(3, '0');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const pub = join(root, 'site', 'public');
for (const d of ['img', 'meta']) {
  rmSync(join(pub, d), { recursive: true, force: true });
  mkdirSync(join(pub, d), { recursive: true });
}

const cards = [];
const counts = {};
const fileHashes = [];
for (let n = 1; n <= TOTAL; n++) {
  const png = readFileSync(join(root, 'assets', 'png', `${pad(n)}.png`));
  const rawMeta = readFileSync(join(root, 'assets', 'metadata', `${pad(n)}.json`));
  fileHashes.push(sha(png), sha(rawMeta));
  const meta = JSON.parse(rawMeta);
  const attr = Object.fromEntries(meta.attributes.map((a) => [a.trait_type, a.value]));
  if (!FLAVOR_HEX[attr.Flavor]) throw new Error(`card ${n}: unknown flavor ${attr.Flavor}`);
  if (!(attr.Rarity in EXPECTED)) throw new Error(`card ${n}: unknown rarity ${attr.Rarity}`);
  counts[attr.Rarity] = (counts[attr.Rarity] || 0) + 1;
  copyFileSync(join(root, 'assets', 'png', `${pad(n)}.png`), join(pub, 'img', `${pad(n)}.png`));
  meta.image = `${SITE_URL}/img/${pad(n)}.png`;
  writeFileSync(join(pub, 'meta', `${n}.json`), JSON.stringify(meta, null, 2));
  cards.push({
    id: n,
    name: meta.name.replace(/\s+#\d+$/, ''),
    flavor: attr.Flavor,
    color: FLAVOR_HEX[attr.Flavor],
    rarity: attr.Rarity,
    eyes: attr.Eyes,
    mouth: attr.Mouth,
    pose: attr.Pose,
    stats: STATS.map((s) => attr[s]),
    img: `/img/${pad(n)}.png`,
  });
}
for (const [tier, want] of Object.entries(EXPECTED)) {
  if (counts[tier] !== want) throw new Error(`rarity split wrong: ${tier} has ${counts[tier]}, expected ${want}`);
}

// One fingerprint for the whole set: sha256 over the per file sha256 hex strings,
// in order png 001, metadata 001, png 002, metadata 002 and so on, using the untouched source files.
const provenance = '0x' + sha(Buffer.from(fileHashes.join('')));

writeFileSync(join(pub, 'meta', 'collection.json'), JSON.stringify({
  name: 'Street Splatz',
  description: 'Genesis Drop. 100 only. Wild flavor drops from The Machine on Base.',
  image: `${SITE_URL}/img/016.png`,
  external_link: SITE_URL,
}, null, 2));
writeFileSync(join(pub, 'cards.json'), JSON.stringify({ statNames: STATS, tiers: EXPECTED, provenance, cards }));
writeFileSync(join(root, 'assets', 'provenance.json'), JSON.stringify({ provenance, method: 'sha256 over concatenated sha256 hex of png NNN then metadata NNN, cards 001 to 100, source files in assets/' }, null, 2) + '\n');
console.log(`built ${cards.length} cards for ${SITE_URL}`, counts, provenance);
