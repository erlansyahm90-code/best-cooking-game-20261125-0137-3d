// Junction Kitchen 3D — entrypoint (Node 22, standard library only).
// Hands the game in: copies this repository's game/ and screenshots/
// beside this file into /output (or MAKEFUN_OUTPUT_DIR outside the
// grader) and writes /output/dossier.json with the kit's buildDossier
// from vendor/makefun-game.ts. Run it twice and it writes the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(msg) {
  throw new Error('Junction Kitchen 3D gate: ' + msg);
}

// Pre-flight gate (same limits as kit RULES.txt, "The gate"): fail loudly
// here instead of shipping a dossier the scorer would reject.
// The four shots are cover / chop / stove / shop — the 4th frame shows
// the upgrade shop open (all 9 upgrades), not a second serve moment.
function checkGate() {
  const shotDir = join(repoRoot, 'screenshots');
  const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
  if (shots.length < 3 || shots.length > 4) fail(`need 3-4 screenshots, found ${shots.length}`);
  for (const f of shots) {
    const bytes = statSync(join(shotDir, f)).size;
    if (bytes > 262144) fail(`screenshot ${f} is ${bytes} bytes (> 262144)`);
  }
  const indexHtml = join(repoRoot, 'game', 'index.html');
  if (!existsSync(indexHtml)) fail('game/index.html missing');
  if (statSync(indexHtml).size > 1048576) fail('game/index.html over 1 MiB');
  let files = 0;
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else files += 1;
    }
  })(join(repoRoot, 'game'));
  if (files > 993) fail(`game/ has ${files} files (> 993)`);
}

function copyTree(name) {
  const src = join(repoRoot, name);
  const dst = join(outDir, name);
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

checkGate();
mkdirSync(outDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

// The scorer's caps for this bounty (see kit RULES.txt, "The gate").
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
