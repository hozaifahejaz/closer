// Copies the repo's questions.json (the one the website and two-player app use) into this
// app, so the offline app ships exactly the same decks. Run before a release build.
import { copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../questions.json', import.meta.url));
const to = fileURLToPath(new URL('../src/data/questions.json', import.meta.url));
copyFileSync(from, to);
const decks = JSON.parse(readFileSync(to, 'utf8'));
const live = Object.values(decks).reduce((n, list) => n + list.filter(Boolean).length, 0);
console.log(`Bundled ${Object.keys(decks).length} decks, ${live} live questions.`);
