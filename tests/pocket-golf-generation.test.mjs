import assert from 'node:assert/strict';
import test from 'node:test';
import { generateHole, validateHole, settingsFromAddress, holeAddress, LAYOUTS, HAZARDS } from '../packages/pocket-golf/dist/generator.js';
import { surfaceAt, contains, blob, distance, simulateShot, PRACTICE_HOLE } from '../packages/pocket-golf/dist/course.js';
import { PocketGolfElement } from '../packages/pocket-golf/dist/pocket-golf.js';
import { createReview, parseReviews, reviewText, holeFingerprint } from '../packages/pocket-golf/dist/reviews.js';

test('versioned hole addresses round-trip seeds and all layout options', () => {
  const settings = { version: 'g2', seed: 'lake: day / café ⛳', index: 42, layout: 'dogleg', hazards: 'water' };
  assert.deepEqual(settingsFromAddress(holeAddress(settings)), settings);
  for (const bad of ['g4:seed:0:mixed:mixed', 'g1::0:mixed:mixed', 'g1:%ZZ:0:mixed:mixed', 'g1:x:-1:mixed:mixed', 'g1:x:0:foo:mixed', 'g1:x:0:mixed:mixed:extra']) {
    assert.equal(settingsFromAddress(bad), null);
  }
});

test('same address reproduces every point and par, independent of other generations', () => {
  const first = generateHole({ seed: 'repeat', index: 9, layout: 'islands', hazards: 'water' });
  for (let index = 0; index < 50; index++) generateHole({ seed: 'unrelated', index });
  const replay = generateHole(settingsFromAddress(first.id));
  assert.deepEqual(replay, first);
  assert.equal(holeFingerprint(replay), holeFingerprint(first));
  assert.notEqual(holeFingerprint(generateHole({ ...first.settings, index: 10 })), holeFingerprint(first));
});

test('2,000 generated holes preserve requested hazards, a safe approach route and bounded retries', () => {
  let fallbacks = 0;
  const seen = new Set();
  for (const layout of LAYOUTS) for (const hazards of HAZARDS) for (let index = 0; index < 100; index++) {
    const hole = generateHole({ seed: 'generation-check', index, layout, hazards });
    const label = hole.id;
    assert.equal(hole.validation.valid, true, `${label}: ${hole.validation.reasons.join(', ')}`);
    assert.ok(hole.validation.attempts <= 25, label);
    assert.equal(surfaceAt(hole.tee, hole), 'fairway', label);
    assert.equal(surfaceAt(hole.cup, hole), 'green', label);
    assert.ok(hole.par >= 3 && hole.par <= 5, label);
    assert.ok(hole.validation.safeRoute.length >= 2, label);
    assert.equal(surfaceAt(hole.validation.safeRoute.at(-1), hole), 'green', label);
    for (const point of hole.validation.safeRoute) assert.ok(['fairway', 'green'].includes(surfaceAt(point, hole)), label);
    if (hazards === 'none') assert.equal(hole.water.length + hole.sand.length, 0, label);
    if (hazards === 'water') { assert.ok(hole.water.length > 0, label); assert.equal(hole.sand.length, 0, label); }
    if (hazards === 'sand') { assert.ok(hole.sand.length > 0, label); assert.equal(hole.water.length, 0, label); }
    if (!hole.validation.fallback && layout !== 'mixed') assert.equal(hole.shape, layout, label);
    fallbacks += Number(hole.validation.fallback); seen.add(hole.shape);
  }
  assert.equal(seen.size, 4);
  assert.ok(fallbacks < 20, `Unexpected fallback frequency: ${fallbacks}`);
});

test('hazards cannot cover the cup, tee or green, or overlap each other', () => {
  for (let index = 0; index < 50; index++) {
    const hole = generateHole({ index });
    for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
      const p = { x, y };
      const patches = [...hole.water, ...hole.sand].filter(patch => contains(patch, p));
      assert.ok(patches.length <= 1, hole.id);
      if (patches.length) assert.equal(contains(hole.green, p), false, hole.id);
    }
    for (const hazard of [...hole.water, ...hole.sand]) {
      assert.equal(contains(hazard, hole.tee), false);
      assert.equal(contains(hazard, hole.cup), false);
    }
  }
});

test('invalid course geometry fails the playability check', () => {
  const hole = generateHole({ hazards: 'none' });
  hole.tee = { x: -30, y: -30 };
  const checked = validateHole(hole);
  assert.equal(checked.valid, false);
  assert.ok(checked.reasons.includes('Tee must be on fairway'));
});

test('generated green uses its own cup and the approved short-putt rules', () => {
  const hole = generateHole({ seed: 'green-test', layout: 'islands' });
  const start = { x: hole.cup.x - 4, y: hole.cup.y };
  const shot = simulateShot(start, hole.cup, undefined, 0, hole);
  assert.equal(shot.outcome, 'cup');
  assert.ok(distance(shot.end, hole.cup) < 1e-9);
});

test('loading and resizing a generated hole preserves geometry and isolates caller mutations', () => {
  const hole = generateHole({ seed: 'element-check' });
  const element = Object.create(PocketGolfElement.prototype);
  const noop = () => {};
  Object.assign(element, { hole: PRACTICE_HOLE, total: -2, holes: 3, cancelInput: noop, syncUI: noop, requestDraw: noop, setAnimationSettled: noop, dispatchEvent: noop });
  element.loadHole(hole);
  const state = element.getSnapshot();
  assert.equal(state.holeId, hole.id);
  assert.deepEqual(state.ball, hole.tee);
  assert.equal(element.total, -2);
  assert.equal(element.holes, 3);
  hole.tee.x = 0;
  assert.notEqual(element.getSnapshot().ball.x, 0);
  const fingerprint = holeFingerprint(element.hole);
  element.canvasDidResize();
  assert.equal(holeFingerprint(element.hole), fingerprint);
});

test('review mode holds a completed hole for feedback', () => {
  const element = Object.create(PocketGolfElement.prototype);
  Object.assign(element, { phase: 'complete', elapsed: 0, getAttribute: () => null, hasAttribute: name => name === 'review' });
  for (let i = 0; i < 300; i++) element.updateFrame(.05);
  assert.equal(element.phase, 'complete');
  assert.equal(element.elapsed, 0);
});

test('feedback survives storage round-trip and carries the exact hole and last shot', () => {
  const hole = generateHole({ seed: 'notes', index: 12 });
  const snapshot = { holeId: hole.id, ball: hole.tee, strokes: 1, view: 'hole', phase: 'aim', lastShot: { start: hole.tee, target: hole.cup, end: hole.tee, power: .4, angle: .02, outcome: 'water' } };
  const review = createReview(hole, snapshot, 'tweak', ['Hazard placement'], 'Move the water farther right.');
  const restored = parseReviews(JSON.stringify([review]));
  assert.deepEqual(restored, [review]);
  const text = reviewText(restored[0], 'http://localhost:3001');
  assert.ok(text.includes(hole.id));
  assert.ok(text.includes('Move the water farther right.'));
  assert.ok(text.includes('"outcome":"water"'));
  const link = text.split('\n').find(line => line.startsWith('Replay: ')).slice(8);
  const replaySettings = settingsFromAddress(new URL(link).searchParams.get('hole'));
  assert.equal(holeFingerprint(generateHole(replaySettings)), review.fingerprint);
});

test('corrupt feedback records cannot discard valid neighboring feedback', () => {
  const hole = generateHole();
  const valid = createReview(hole, null, 'keep', [], 'Nice shape');
  assert.deepEqual(parseReviews('{bad'), []);
  assert.deepEqual(parseReviews('{}'), []);
  assert.deepEqual(parseReviews(JSON.stringify([valid, null, { ...valid, snapshot: {} }, { ...valid, address: 'g2:nope' }])), [valid]);
  assert.equal(createReview(hole, { holeId: 'different' }, 'keep', [], '').snapshot, null);
});


test('all four reported g1 holes retain their original fingerprints', () => {
  const fingerprints = ['f43fbb4d', '7b22ebc6', '3ccd795f', 'f01f1704'];
  for (let index = 0; index < fingerprints.length; index++) {
    const settings = settingsFromAddress(`g1:greenskeeper:${index}:mixed:mixed`);
    assert.equal(holeFingerprint(generateHole(settings)), fingerprints[index]);
  }
});

function visibleWaterArea(hole) {
  let area = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    if (surfaceAt({ x, y }, hole) === 'water') area++;
  }
  return area;
}
function greenGap(hole, sand) {
  let gap = Infinity;
  const angle = Math.atan2(sand.y - hole.green.y, sand.x - hole.green.x);
  for (let r = 0; r < 65; r += .25) {
    const p = { x: hole.green.x + Math.cos(angle) * r, y: hole.green.y + Math.sin(angle) * r };
    if (contains(hole.green, p)) gap = 0;
    else if (contains(sand, p)) return gap;
    else gap += .25;
  }
  return Infinity;
}

test('reported sand traps hug the approach side of the same green in g2', () => {
  for (const index of [0, 2, 3]) {
    const old = generateHole({ version: 'g1', index }), tuned = generateHole({ version: 'g2', index });
    assert.deepEqual(tuned.fairway, old.fairway);
    assert.deepEqual(tuned.green, old.green);
    assert.deepEqual(tuned.tee, old.tee);
    assert.deepEqual(tuned.cup, old.cup);
    assert.equal(tuned.par, old.par);
    assert.equal(tuned.validation.fallback, false);
    const approach = tuned.route.at(-2);
    for (const sand of tuned.sand) {
      assert.ok(greenGap(tuned, sand) <= 4, `${tuned.id}: gap ${greenGap(tuned, sand)}`);
      assert.ok((sand.x - tuned.green.x) * (approach.x - tuned.green.x) + (sand.y - tuned.green.y) * (approach.y - tuned.green.y) > 0);
    }
  }
});

test('reported pairs of ponds become one larger visible lake in g2', () => {
  for (const index of [0, 1, 2]) {
    const old = generateHole({ version: 'g1', index }), tuned = generateHole({ version: 'g2', index });
    assert.equal(tuned.water.length, 1);
    assert.ok(visibleWaterArea(tuned) > visibleWaterArea(old) * 1.08, tuned.id);
    assert.equal(tuned.validation.valid, true);
    assert.equal(tuned.validation.fallback, false);
  }
});

test('feedback from all generator versions survives storage and replays exactly', () => {
  const records = ['g1', 'g2', 'g3'].map(version => createReview(generateHole({ version, index: 2 }), null, 'tweak', [], 'Compare hazards'));
  const parsed = parseReviews(JSON.stringify(records));
  assert.equal(parsed.length, 3);
  for (const review of parsed) assert.equal(holeFingerprint(generateHole(settingsFromAddress(review.address))), review.fingerprint);
});

test('water cannot cover the fairway in the rough-buffer terrain rules', () => {
  for (const index of [43, 96]) {
    const hole = generateHole({ version: 'g3', index });
    let checked = 0;
    for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
      const p = { x, y };
      if (contains(hole.green, p) || hole.sand.some(sand => contains(sand, p))) continue;
      if (hole.water.some(water => contains(water, p)) && hole.fairway.some(fairway => contains(fairway, p))) {
        assert.equal(surfaceAt(p, hole), 'fairway'); checked++;
      }
    }
    assert.ok(checked > 100);
  }
});


test('rough banks follow the rounded fairway edge and are solid terrain', () => {
  const hole = { ...PRACTICE_HOLE, version: 'g3', waterRoughBuffer: 4, sand: [],
    fairway: [{ kind: 'lane', start: { x: 100, y: 40 }, end: { x: 100, y: 200 }, startRadius: 20, endRadius: 20 }],
    water: [blob(120, 190, 60, 60)] };
  assert.equal(surfaceAt({ x: 119, y: 180 }, hole), 'fairway');
  assert.equal(surfaceAt({ x: 121, y: 180 }, hole), 'rough');
  assert.equal(surfaceAt({ x: 123, y: 180 }, hole), 'rough');
  assert.equal(surfaceAt({ x: 125, y: 180 }, hole), 'water');
  assert.equal(surfaceAt({ x: 100, y: 219 }, hole), 'fairway');
  assert.equal(surfaceAt({ x: 120, y: 210 }, hole), 'rough');
  assert.equal(surfaceAt({ x: 125, y: 210 }, hole), 'water');
  const start = { x: 100, y: 90 }, target = { x: 100, y: 160 };
  assert.equal(simulateShot(start, target, undefined, 0, hole).outcome, 'rest');
  assert.equal(simulateShot(start, target, undefined, 0, { ...hole, version: 'g2', waterRoughBuffer: undefined }).outcome, 'water');
});

test('g3 preserves the accepted g2 bunkers and all placement geometry', () => {
  for (let index = 0; index < 100; index++) {
    const old = generateHole({ version: 'g2', index }), next = generateHole({ version: 'g3', index });
    for (const key of ['tee', 'cup', 'green', 'fairway', 'sand', 'water', 'par']) assert.deepEqual(next[key], old[key], `${index}: ${key}`);
    assert.equal(next.waterRoughBuffer, 4);
    for (const sand of next.sand) assert.equal(surfaceAt({ x: sand.x, y: sand.y }, next), 'sand');
  }
});

test('water never directly touches fairway on buffered dogleg and island holes', () => {
  let shorePixels = 0;
  for (const layout of ['dogleg', 'islands']) for (let index = 0; index < 10; index++) {
    const hole = generateHole({ version: 'g3', layout, hazards: 'water', index });
    const terrain = [];
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) terrain.push(surfaceAt({ x, y }, hole));
    for (let y = 1; y < 255; y++) for (let x = 1; x < 255; x++) {
      const i = y * 256 + x;
      if (terrain[i] !== 'water') continue;
      for (const offset of [-257, -256, -255, -1, 1, 255, 256, 257]) {
        assert.notEqual(terrain[i + offset], 'fairway', `${hole.id}: ${x},${y}`);
        if (terrain[i + offset] === 'rough') shorePixels++;
      }
    }
  }
  assert.ok(shorePixels > 100);
});

test('g2 fingerprints remain unchanged and g3 fingerprints include shoreline rules', () => {
  const fingerprints = { 0: 'e52830ff', 1: '62d75a67', 2: '738187f8', 3: 'fbc9b9cd', 43: 'c6642ed3', 96: 'ff8d31bc' };
  for (const [index, expected] of Object.entries(fingerprints)) {
    const old = generateHole({ version: 'g2', index: Number(index) });
    const next = generateHole({ version: 'g3', index: Number(index) });
    assert.equal(holeFingerprint(old), expected);
    assert.notEqual(holeFingerprint(next), expected);
    assert.equal(holeFingerprint(generateHole(settingsFromAddress(next.id))), holeFingerprint(next));
  }
});
