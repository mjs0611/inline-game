import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const skins = vm.runInNewContext(source.match(/const SKINS: SkinDef\[\] = (\[[\s\S]*?\n\]);/)[1]);
// Measured visible rocket bounds in the existing player_skins.png, including exhaust.
const bounds = { left: 83, top: 653, right: 183, bottom: 894 };
const rocket = skins.find(s => s.id === 'rocket');
assert.ok(rocket.sx <= bounds.left && rocket.sy <= bounds.top);
assert.ok(rocket.sx + rocket.sw >= bounds.right && rocket.sy + rocket.sh >= bounds.bottom,
  'rocket crop must contain the body and exhaust');
console.log('rocket body and exhaust fit the shared preview/game crop');
