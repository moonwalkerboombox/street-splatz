// Turns the untouched card set in assets/ into the files the site serves.
// Writes site/public/img/NNN.png (the full size token image, from assets/png),
// site/public/img/NNN.webp (the lighter copy the page shows, from assets/web),
// site/public/meta/N.json, site/public/meta/collection.json, site/public/cards.json and
// assets/provenance.json. Fails if the set is not exactly 100 cards in a 4 / 23 / 55 / 18
// rarity split, or if a card image is not 1040 by 1520.
// Only copies files: the images themselves are made by `npm run cards` (assets/brawler).
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
const CARD_W = 1040, CARD_H = 1520;
const pad = (n) => String(n).padStart(3, '0');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// Width and height from the file header, so a stale or half built set cannot be published.
function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
function webpSize(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  return null;
}
function checkSize(what, size) {
  if (!size || size[0] !== CARD_W || size[1] !== CARD_H) {
    throw new Error(`${what} is ${size ? size.join(' by ') : 'not a readable image'}, expected ${CARD_W} by ${CARD_H}. Run npm run cards.`);
  }
}

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
  const web = readFileSync(join(root, 'assets', 'web', `${pad(n)}.webp`));
  checkSize(`assets/png/${pad(n)}.png`, pngSize(png));
  checkSize(`assets/web/${pad(n)}.webp`, webpSize(web));
  fileHashes.push(sha(png), sha(rawMeta));
  const meta = JSON.parse(rawMeta);
  const attr = Object.fromEntries(meta.attributes.map((a) => [a.trait_type, a.value]));
  if (!FLAVOR_HEX[attr.Flavor]) throw new Error(`card ${n}: unknown flavor ${attr.Flavor}`);
  if (!(attr.Rarity in EXPECTED)) throw new Error(`card ${n}: unknown rarity ${attr.Rarity}`);
  counts[attr.Rarity] = (counts[attr.Rarity] || 0) + 1;
  copyFileSync(join(root, 'assets', 'png', `${pad(n)}.png`), join(pub, 'img', `${pad(n)}.png`));
  copyFileSync(join(root, 'assets', 'web', `${pad(n)}.webp`), join(pub, 'img', `${pad(n)}.webp`));
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
    img: `/img/${pad(n)}.webp`,
    full: `/img/${pad(n)}.png`,
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
