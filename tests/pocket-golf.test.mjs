import assert from 'node:assert/strict';
import test from 'node:test';
import { TEE, CUP, PAR, PRACTICE_HOLE, surfaceAt, rangeAt, aimAt, distance, simulateShot, accuracyAngle, meterPosition, powerAtMeter, meterAtPower } from '../packages/pocket-golf/dist/course.js';
import { PocketGolfElement } from '../packages/pocket-golf/dist/pocket-golf.js';

function game(overrides = {}) {
  const element = Object.create(PocketGolfElement.prototype);
  Object.assign(element, {
    hole: PRACTICE_HOLE, ball: { ...TEE }, target: aimAt(TEE, CUP), strokes: 0, total: 0, holes: 0,
    phase: 'aim', green: false, result: '', elapsed: 0, accuracyStart: 1,
    syncUI() {}, requestDraw() {}, setAnimationSettled() {}, dispatchEvent() {}, getAttribute() { return null; }, hasAttribute(name) { return name === 'review'; },
    ...overrides,
  });
  return element;
}

test('the authored hole is finishable with centered shots and automatic putting', () => {
  let ball = { ...TEE };
  let count = 0;
  let visitedGreen = false;
  for (; count < 8; count++) {
    const destination = count === 0 ? { x: 132, y: 125 } : count === 1 ? { x: 171, y: 72 } : CUP;
    const shot = simulateShot(ball, aimAt(ball, destination));
    assert.notEqual(shot.outcome, 'water');
    assert.notEqual(shot.outcome, 'outside');
    if (shot.outcome === 'cup') break;
    ball = shot.end;
    visitedGreen ||= surfaceAt(ball) === 'green';
  }
  assert.ok(visitedGreen);
  assert.ok(count + 1 <= PAR);
});

test('target clamps to surface range while preserving direction', () => {
  for (const ball of [TEE, { x: 20, y: 20 }, { x: 211, y: 78 }, { x: 170, y: 70 }]) {
    const target = aimAt(ball, { x: ball.x + 1000, y: ball.y });
    assert.equal(target.y, ball.y);
    assert.ok(Math.abs(distance(ball, target) - rangeAt(ball)) < 0.0001);
  }
});

test('preview and timed shots use identical physics at selected power and centered accuracy', () => {
  for (const fraction of [0.1, 0.4, 0.7, 1]) {
    const target = { x: TEE.x + rangeAt(TEE) * fraction, y: TEE.y };
    const preview = simulateShot(TEE, target);
    const actual = simulateShot(TEE, target, fraction, 0);
    assert.equal(preview.outcome, actual.outcome);
    assert.ok(distance(preview.end, actual.end) < 1e-9);
    assert.ok(Math.abs(preview.duration - actual.duration) < 1e-9);
  }
  assert.equal(Math.abs(accuracyAngle(0.11)), 0);
  assert.equal(Math.abs(accuracyAngle(0.31)), 0);
  assert.ok(accuracyAngle(0.6) < 0);
  assert.ok(accuracyAngle(0.05) > 0);
});

test('water is ignored in flight but penalized on landing; sand stops carry', () => {
  const start = { x: 150, y: 153 };
  const across = simulateShot(start, { x: 243, y: 153 });
  assert.ok(across.samples.some(p => p.height > 0.1 && surfaceAt(p) === 'water'));
  assert.notEqual(across.outcome, 'water');
  const water = simulateShot(start, { x: 200, y: 153 });
  assert.equal(water.outcome, 'water');
  const sand = simulateShot({ x: 126, y: 115 }, { x: 151, y: 91 });
  assert.equal(surfaceAt(sand.end), 'sand');
  assert.deepEqual(sand.end, sand.landing);
});

test('a slow putt is captured and a fast putt can pass over the cup', () => {
  const start = { x: CUP.x - 12, y: CUP.y };
  assert.equal(simulateShot(start, CUP).outcome, 'cup');
  assert.notEqual(simulateShot(start, { x: CUP.x + 40, y: CUP.y }).outcome, 'cup');
});

test('penalty charges once and restores the pre-shot location', () => {
  const start = { x: 150, y: 153 };
  const element = game({ ball: start, strokes: 1, shot: simulateShot(start, { x: 200, y: 153 }) });
  element.finishShot();
  assert.equal(element.strokes, 2);
  assert.deepEqual(element.ball, start);
  element.finishShot();
  assert.equal(element.strokes, 2);
});

test('completing a hole adds strokes minus par exactly once', () => {
  const start = { x: CUP.x - 12, y: CUP.y };
  const element = game({ ball: start, green: true, strokes: 3, shot: simulateShot(start, CUP) });
  element.finishShot();
  assert.equal(element.total, -1);
  assert.equal(element.holes, 1);
  element.finishShot();
  assert.equal(element.holes, 1);
  element.strokes = 6; element.shot = simulateShot(start, CUP); element.finishShot();
  assert.equal(element.total, 1);
  assert.equal(element.holes, 2);
});

test('settling on or leaving the green changes camera only after the shot', () => {
  const start = { x: 174, y: 90 };
  const element = game({ ball: start, shot: simulateShot(start, { x: 170, y: 74 }) });
  element.finishShot();
  assert.equal(element.phase, 'fade');
  assert.equal(element.green, false);
  const ball = { ...element.ball };
  element.finishFade();
  assert.equal(element.green, true);
  assert.deepEqual(element.ball, ball);
  element.shot = simulateShot(ball, { x: 105, y: 73 });
  element.finishShot(); element.finishFade();
  assert.equal(element.green, false);
});

test('meter timeout returns to aim without charging a stroke', () => {
  const element = game({ phase: 'accuracy', meterTime: 1.97, strokes: 2 });
  element.updateFrame(0.05);
  assert.equal(element.phase, 'aim');
  assert.equal(element.strokes, 2);
});

test('power meter keeps bouncing without input or charging a stroke', () => {
  const element = game({ phase: 'power', meterTime: 0.98, strokes: 2 });
  for (let i = 0; i < 120; i++) element.updateFrame(0.05);
  assert.equal(element.phase, 'power');
  assert.equal(element.strokes, 2);
});

test('power can be selected on the return and on later laps', () => {
  for (const [time, expected] of [[1.2, 0.47 / 0.67], [1.6, 0.07 / 0.67], [2.7, 0.37 / 0.67], [3, 1]]) {
    const element = game({ phase: 'power', meterTime: time });
    Object.defineProperty(element, 'canInput', { value: true });
    element.clickSwing();
    assert.equal(element.phase, 'accuracy');
    assert.ok(Math.abs(element.lockedPower - expected) < 1e-9);
  }
});


test('inset accuracy zone has a straight center and errors on both sides', () => {
  assert.equal(Math.abs(accuracyAngle(0.21)), 0);
  assert.ok(accuracyAngle(0.41) < 0);
  assert.ok(accuracyAngle(0.01) > 0);
  assert.ok(Math.abs(accuracyAngle(0.41) + accuracyAngle(0.01)) < 1e-9);
});

test('late return power selection waits for another accuracy pass without jumping', () => {
  const element = game({ phase: 'power', meterTime: 1.65 });
  Object.defineProperty(element, 'canInput', { value: true });
  const position = meterPosition(element.meterTime);
  element.clickSwing();
  assert.equal(meterPosition(element.meterTime), position);
  assert.equal(element.accuracyStart, 3);
  element.launch = () => assert.fail('accuracy must wait for the next return');
  element.clickSwing();
  element.updateFrame(0.3);
  assert.equal(element.phase, 'accuracy');
  let shot;
  element.launch = (power, angle) => { shot = { power, angle }; };
  element.meterTime = 3.79;
  element.clickSwing();
  assert.ok(Math.abs(shot.power - 0.02 / 0.67) < 1e-9);
  assert.equal(Math.abs(shot.angle), 0);
});

test('a new swing starts at the accuracy centerline', () => {
  const element = game({ phase: 'aim' });
  Object.defineProperty(element, 'canInput', { value: true });
  element.clickSwing();
  assert.equal(element.phase, 'power');
  assert.ok(Math.abs(meterPosition(element.meterTime) - 0.21) < 1e-9);
});

test('a close putt uses low power just beyond the accuracy zone', () => {
  const element = game({ phase: 'power', meterTime: 0.33 + 0.67 * 0.04 });
  Object.defineProperty(element, 'canInput', { value: true });
  element.clickSwing();
  assert.ok(Math.abs(element.lockedPower - 0.04) < 1e-9);
  const start = { x: CUP.x - 3, y: CUP.y };
  const shot = simulateShot(start, CUP, element.lockedPower);
  assert.equal(shot.outcome, 'cup');
});


test('preparation space contributes no power and cannot lock an accidental shot', () => {
  for (const position of [0, 0.09, 0.21, 0.3, 0.33]) {
    assert.equal(powerAtMeter(position), 0);
    const element = game({ phase: 'power', meterTime: position });
    Object.defineProperty(element, 'canInput', { value: true });
    element.clickSwing();
    assert.equal(element.phase, 'power');
    assert.equal(element.strokes, 0);
  }
});

test('power target markers match the playable percentage on both passes', () => {
  for (const power of [0.01, 0.04, 0.25, 0.5, 1]) {
    const marker = meterAtPower(power);
    assert.ok(marker > 0.33 && marker <= 1);
    for (const time of [marker, 2 - marker]) {
      const element = game({ phase: 'power', meterTime: time });
      Object.defineProperty(element, 'canInput', { value: true });
      element.clickSwing();
      assert.ok(Math.abs(element.lockedPower - power) < 1e-9);
    }
  }
});
