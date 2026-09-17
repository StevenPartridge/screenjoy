import assert from 'node:assert/strict';
import test from 'node:test';
import { GolfScores, SCORE_STORAGE_KEY, parseTotals, holeResult } from '../packages/pocket-golf/dist/scores.js';
import { PocketGolfElement, generateHole } from '../packages/pocket-golf/dist/pocket-golf.js';
import { aimAt, simulateShot } from '../packages/pocket-golf/dist/course.js';

function storage() {
  const values = new Map([[SCORE_STORAGE_KEY, JSON.stringify({ version: 1, score: 0, holes: 0 })]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function game(index = 0, review = false) {
  const hole = generateHole({ seed: 'greenskeeper', index });
  const element = Object.create(PocketGolfElement.prototype);
  const events = [];
  Object.assign(element, { hole, ball: { ...hole.tee }, target: aimAt(hole.tee, hole.cup, hole), strokes: 0,
    total: 0, holes: 0, phase: 'aim', green: false, result: '', elapsed: 0, initialized: true,
    events, dispatchEvent(event) { events.push(event); }, cancelInput() {}, syncUI() {}, requestDraw() {}, setAnimationSettled() {},
    getAttribute() { return null; }, hasAttribute(name) { return name === 'review' && review; } });
  return element;
}
function sink(element, strokes) {
  const { cup } = element.hole;
  const start = { x: cup.x - 3, y: cup.y };
  element.strokes = strokes;
  element.shot = simulateShot(start, cup, undefined, 0, element.hole);
  assert.equal(element.shot.outcome, 'cup');
  element.finishShot();
}
function useStorage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const backing = storage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: backing });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  return backing;
}

test('saved score survives a new session, counts only completed holes, and can cross par in either direction', () => {
  const backing = storage();
  const first = new GolfScores(() => backing);
  assert.deepEqual(first.read(), { version: 1, score: 0, holes: 0 });
  assert.deepEqual(first.complete(3, 4), { version: 1, score: -1, holes: 1 });
  const reloaded = new GolfScores(() => backing);
  assert.deepEqual(reloaded.read(), first.read());
  assert.deepEqual(reloaded.complete(6, 4), { version: 1, score: 1, holes: 2 });
  assert.deepEqual(reloaded.complete(3, 4), { version: 1, score: 0, holes: 3 });
  assert.deepEqual(JSON.parse(backing.getItem(SCORE_STORAGE_KEY)), reloaded.read());
});

test('bad score records are rejected without breaking play', () => {
  for (const raw of [null, '', '{', 'null', '[]', '{}', '{"version":2,"score":0,"holes":0}',
    '{"version":1,"score":2,"holes":0}', '{"version":1,"score":0.2,"holes":1}',
    '{"version":1,"score":0,"holes":-1}', '{"version":1,"score":"0","holes":1}']) {
    assert.equal(parseTotals(raw), null);
    const scores = new GolfScores(() => ({ getItem: () => raw, setItem() {} }));
    assert.equal(scores.complete(4, 4).holes, 1);
  }
});

test('storage access and quota failures retain scores for the session', () => {
  for (const storage of [() => { throw new Error('Blocked'); }, () => null,
    () => ({ getItem: () => '{"version":1,"score":-2,"holes":3}', setItem() { throw new Error('Quota'); } })]) {
    const scores = new GolfScores(storage);
    const before = scores.read();
    scores.complete(3, 4); scores.complete(6, 4);
    assert.deepEqual(scores.read(), { version: 1, score: before.score + 1, holes: before.holes + 2 });
    assert.equal(scores.saved, false);
  }
});

test('celebration uses golf names with the completed hole score', () => {
  assert.equal(holeResult(3, 4), 'Birdie · -1');
  assert.equal(holeResult(4, 4), 'Par · 0');
  assert.equal(holeResult(5, 4), 'Bogey · +1');
  assert.equal(holeResult(2, 4), 'Eagle · -2');
  assert.equal(holeResult(1, 4), 'Hole in one · -3');
  assert.equal(holeResult(8, 4), '8 strokes · +4');
});

test('twelve completed holes advance exactly once each and preserve the seed and saved total', t => {
  const backing = useStorage(t);
  const element = game(96);
  for (let index = 96; index < 108; index++) {
    assert.equal(element.hole.id, `g3:greenskeeper:${index}:mixed:mixed`);
    sink(element, element.hole.par - 1);
    element.finishShot();
    assert.equal(element.getTotals().holes, index - 95);
    assert.equal(element.result, 'Birdie · -1');
    element.updateFrame(2.19);
    assert.equal(element.phase, 'complete');
    element.updateFrame(0.02);
    assert.equal(element.phase, 'fade');
    element.updateFrame(0.28);
    element.applyFade();
    element.updateFrame(0.28);
    assert.equal(element.phase, 'aim');
    assert.equal(element.holeIndex, index + 1);
    assert.equal(element.strokes, 0);
    assert.equal(element.lastShot, null);
    assert.deepEqual(element.ball, element.hole.tee);
  }
  assert.deepEqual(JSON.parse(backing.getItem(SCORE_STORAGE_KEY)), { version: 1, score: -12, holes: 12 });
  assert.equal(element.events.filter(event => event.type === 'scorechange').length, 12);
  assert.equal(element.events.filter(event => event.type === 'holechange').length, 12);
});

test('replay and reconnect do not recount completion; another completed replay counts normally', t => {
  const backing = useStorage(t), element = game(96);
  sink(element, element.hole.par);
  const record = backing.getItem(SCORE_STORAGE_KEY);
  element.preserveOnConnect = true; element.resetScene();
  element.finishShot();
  assert.equal(element.phase, 'complete');
  assert.equal(backing.getItem(SCORE_STORAGE_KEY), record);
  element.restart();
  assert.equal(element.holeIndex, 96);
  assert.equal(element.strokes, 0);
  assert.equal(backing.getItem(SCORE_STORAGE_KEY), record);
  sink(element, element.hole.par + 1);
  assert.deepEqual(element.getTotals(), { version: 1, score: 1, holes: 2 });
});

test('the lab keeps its own score and holds completed holes for review', t => {
  const backing = useStorage(t), element = game(96, true);
  sink(element, element.hole.par - 1);
  element.updateFrame(10);
  assert.equal(element.phase, 'complete');
  assert.equal(element.getTotals().score, -1);
  assert.equal(JSON.parse(backing.getItem(SCORE_STORAGE_KEY)).holes, 0);
  element.beginFade(false, true); element.finishFade();
  assert.equal(element.holeIndex, 96);
});

test('reduced motion advances after the result without an animated fade and clears its timer', t => {
  useStorage(t);
  const element = game(96);
  Object.defineProperty(element, 'reducedMotion', { value: true });
  sink(element, element.hole.par);
  assert.ok(element.celebrationTimer);
  element.updateFrame(2.2);
  assert.equal(element.phase, 'aim');
  assert.equal(element.holeIndex, 97);
  assert.equal(element.celebrationTimer, undefined);
});

test('switching a course abandons unfinished strokes without changing completed totals', t => {
  const backing = useStorage(t), element = game(96);
  sink(element, element.hole.par - 1);
  element.restart(); element.strokes = 7;
  element.startCourse({ version: 'g2', seed: 'shared', index: 12 });
  assert.equal(element.holeAddress, 'g2:shared:12:mixed:mixed');
  assert.equal(element.phase, 'aim');
  assert.equal(element.strokes, 0);
  assert.deepEqual(JSON.parse(backing.getItem(SCORE_STORAGE_KEY)), { version: 1, score: -1, holes: 1 });
});
