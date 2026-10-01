import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const fn = source.match(/function preloadAitAd\(next\?: \(\) => void\) \{[\s\S]*?\n\}/)[0].replace('next?: () => void', 'next');
// Ad groups must load one at a time: the second load starts only after the first answers.
for (const answer of ['loaded', 'error']) {
  const loads = [];
  const context = { aitAdLoaded: true, AIT_AD_GROUP_ID: 'first', ait: { loadFullScreenAd: (p) => { loads.push(p); } } };
  vm.runInNewContext(`${fn}; preloadAitAd(() => loads.push({ options: { adGroupId: 'second' } }));`, { ...context, loads });
  assert.deepEqual(loads.map(l => l.options.adGroupId), ['first']);
  if (answer === 'loaded') loads[0].onEvent({ type: 'loaded' }); else loads[0].onError(new Error('x'));
  assert.deepEqual(loads.map(l => l.options.adGroupId), ['first', 'second']);
  loads[0].onEvent({ type: 'loaded' }); // a second answer must not start another load
  assert.equal(loads.length, 2);
}
console.log('preload order: sequential after loaded and after error, no duplicate: passed');
