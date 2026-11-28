// Sets the passcode that unlocks the classic game (the pixel lock on the start screen).
//   npm run passcode -- NEWCODE
// Only a hash of it is written into src/daily/daily.ts. Case and surrounding spaces do not matter.
// It is a soft lock, not security: the check runs in the player's browser.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'daily', 'daily.ts');

/** The same hash as hashCode in src/daily/daily.ts (cyrb53). */
export function hashCode(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = (process.argv[2] ?? '').trim().toLowerCase();
  if (code.length < 4) {
    console.error('Usage: npm run passcode -- NEWCODE   (at least 4 characters)');
    process.exit(1);
  }
  const source = readFileSync(FILE, 'utf8');
  const line = /export const CLASSIC_PASSCODE_HASH = \d+;/;
  if (!line.test(source)) throw new Error('src/daily/daily.ts has no CLASSIC_PASSCODE_HASH line');
  writeFileSync(FILE, source.replace(line, `export const CLASSIC_PASSCODE_HASH = ${hashCode(code)};`));
  console.log('The classic game now opens with the new passcode. Rebuild and redeploy for it to take effect.');
  console.log(`Its hash is ${hashCode(code)} (a build can be given it as VITE_CLASSIC_PASSCODE_HASH instead).`);
}
