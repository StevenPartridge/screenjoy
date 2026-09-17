import assert from 'node:assert/strict';
import test from 'node:test';
import { createScene, projectStar, toCamera, fromCamera } from '../packages/starliner/dist/scene.js';
import { buildExterior, exteriorPose, drawExterior } from '../packages/starliner/dist/exterior.js';
import { StarlinerElement } from '../packages/starliner/dist/starliner.js';

function element(seed = '2026', mode = 'ftl') {
  const saver = Object.create(StarlinerElement.prototype);
  const attributes = new Map([['seed', seed], ['mode', mode]]);
  saver.getAttribute = key => attributes.get(key) ?? null;
  saver.setAttribute = (key, value) => attributes.set(key, String(value));
  saver.removeAttribute = key => attributes.delete(key);
  saver.resetScene();
  return saver;
}

test('a seed reproduces the entire cabin and starfield independently of other flights', () => {
  const first = createScene('window-seat');
  createScene('different-seat');
  assert.deepEqual(createScene('window-seat'), first);
  assert.notDeepEqual(createScene('different-seat'), first);
  const scenes = Array.from({ length: 100 }, (_, i) => createScene(String(i)));
  assert.equal(new Set(scenes.map(s => s.direction)).size, 4);
  assert.equal(new Set(scenes.map(s => s.shape)).size, 3);
  assert.equal(new Set(scenes.map(s => s.material.name)).size, 4);
  assert.ok(new Set(scenes.map(s => s.stars.length)).size > 20);
});

test('forward stars move outward and their FTL trails point back to the vanishing point', () => {
  const scene = { ...createScene('forward'), camera: { yaw: 0, pitch: 0, roll: 0 } };
  const star = { x: 0.6, y: 0.3, depth: 0.8, size: 1, tint: 0, phase: 0 };
  const start = projectStar(star, scene, 0, 0.28, 1.6);
  const next = projectStar(star, scene, 0.1, 0.28, 1.6);
  assert.ok(next.x > start.x && next.y < start.y);
  assert.ok(next.tailX < next.x && next.tailY > next.y);
  assert.ok(next.tailX > scene.focus.x && next.tailY < scene.focus.y);
});

test('side views travel in opposite directions, with nearby stars overtaking distant stars', () => {
  const scene = createScene('side');
  const star = { x: 0.5, y: 0.3, depth: 0.52, size: 1, tint: 0, phase: 0 };
  for (const direction of ['port', 'starboard']) {
    const side = { ...scene, camera: { yaw: direction === 'port' ? -Math.PI / 2 : Math.PI / 2, pitch: 0, roll: 0 } };
    const sideStar = { ...star, x: direction === 'port' ? -2 : 2 };
    const a = projectStar(sideStar, side, 0, 0.28, 1.6);
    const b = projectStar(sideStar, side, 0.1, 0.28, 1.6);
    const near = projectStar({ ...sideStar, x: sideStar.x * 0.3 }, side, 0.1, 0.28, 1.6);
    assert.equal(Math.sign(b.x - a.x), direction === 'port' ? -1 : 1);
    const nearStart = projectStar({ ...sideStar, x: sideStar.x * 0.3 }, side, 0, 0.28, 1.6);
    assert.ok(Math.abs(near.x - nearStart.x) > Math.abs(b.x - a.x));
    assert.ok(Math.abs(b.y - a.y) < 1e-10);
    assert.equal(Math.sign(b.x - b.tailX), direction === 'port' ? -1 : 1);
  }
});

test('long flights and narrow viewports retain finite projections through wrapping', () => {
  for (let seed = 0; seed < 10; seed++) {
    const scene = createScene(String(seed));
    for (const star of scene.stars) for (const distance of [0, 4.2, 1000, 1e7]) {
      const projection = projectStar(star, scene, distance, 0.28, 0.4);
      assert.ok(Object.values(projection).every(Number.isFinite));
    }
  }
});

test('mode transitions preserve the seat and ease speed without restarting the flight', () => {
  const saver = element('2026', 'cruise');
  const scene = saver.scene;
  saver.updateFrame(1);
  const cruiseDistance = saver.distance;
  saver.mode = 'ftl';
  saver.attributeDidChange('mode');
  saver.updateFrame(0.05);
  assert.equal(saver.scene, scene);
  assert.ok(saver.warp > 0 && saver.warp < 0.1);
  assert.ok(saver.distance > cruiseDistance);
  for (let i = 0; i < 200; i++) saver.updateFrame(0.05);
  assert.ok(saver.warp > 0.99);
  saver.mode = 'cruise';
  saver.updateFrame(0.05);
  assert.ok(saver.warp < 0.99 && saver.warp > 0.8);
});

test('resizing retains flight state and seed changes reproduce the initial scene', () => {
  const saver = element();
  saver.updateFrame(0.05);
  const distance = saver.distance, stars = saver.scene.stars;
  saver.canvasDidResize();
  assert.equal(saver.distance, distance);
  assert.equal(saver.scene.stars, stars);
  saver.setAttribute('seed', 'another');
  saver.attributeDidChange('seed');
  assert.equal(saver.distance, 0);
  assert.deepEqual(saver.scene, createScene('another'));
});

test('properties normalize framework values and identical frame steps reproduce motion', () => {
  const a = element(), b = element();
  a.speed = '1.5'; b.speed = '1.5';
  for (let i = 0; i < 1000; i++) { a.updateFrame(1 / 30); b.updateFrame(1 / 30); }
  assert.equal(a.distance, b.distance);
  assert.equal(a.speed, 1.5);
  a.speed = 99; assert.equal(a.speed, 2.5);
  a.speed = null; assert.equal(a.speed, 1);
  a.mode = 'invalid'; assert.equal(a.mode, 'ftl');
  a.mode = 'cruise'; assert.equal(a.mode, 'cruise');
  a.mode = null; assert.equal(a.mode, 'ftl');
});


test('camera rotations round-trip ship coordinates without changing distance', () => {
  for (let seed = 0; seed < 100; seed++) {
    const { camera } = createScene(String(seed));
    const point = { x: 1.3, y: -2.1, z: 4.7 };
    const local = toCamera(point, camera);
    const back = fromCamera(local, camera);
    for (const key of ['x', 'y', 'z']) assert.ok(Math.abs(back[key] - point[key]) < 1e-12);
    assert.ok(Math.abs(Math.hypot(...Object.values(local)) - Math.hypot(...Object.values(point))) < 1e-12);
  }
});

test('aft stars converge and pitched oblique views have diagonal trails', () => {
  const aft = { ...createScene('aft'), camera: { yaw: Math.PI, pitch: 0, roll: 0 } };
  const star = { x: 0.6, y: 0.3, depth: 0.2, size: 1, tint: 0, phase: 0 };
  const a = projectStar(star, aft, 0, 0.5, 1.6);
  const b = projectStar(star, aft, 0.2, 0.5, 1.6);
  assert.ok(Math.abs(b.x - aft.focus.x) < Math.abs(a.x - aft.focus.x));
  assert.ok(Math.abs(b.y - aft.focus.y) < Math.abs(a.y - aft.focus.y));
  const oblique = { ...aft, camera: { yaw: -0.9, pitch: 0.6, roll: 0.1 } };
  const projected = projectStar({ ...star, depth: 0.8 }, oblique, 0, 0.5, 1.6);
  assert.ok(Math.abs(projected.x - projected.tailX) > 0.001);
  assert.ok(Math.abs(projected.y - projected.tailY) > 0.001);
});

test('stars fade at world-cell boundaries and stay hidden behind the camera', () => {
  const scene = { ...createScene('seam'), camera: { yaw: 0, pitch: 0, roll: 0 } };
  const star = { x: 0, y: 0, depth: 0.99999, size: 1, tint: 0, phase: 0 };
  assert.ok(projectStar(star, scene, 0, 0.95, 1.6).brightness < 0.001);
  assert.equal(projectStar({ ...star, depth: 0.2 }, scene, 0, 0.95, 1.6).brightness, 0);
});

test('seeds cover continuous angles and every exterior, including clear seats', () => {
  const scenes = Array.from({ length: 200 }, (_, i) => createScene(String(i)));
  assert.equal(new Set(scenes.map(s => s.camera.yaw)).size, 200);
  assert.equal(new Set(scenes.map(s => s.exterior.kind)).size, 5);
  for (const scene of scenes) {
    const model = buildExterior(scene);
    assert.deepEqual(model, buildExterior(scene));
    assert.ok(model.length < 600);
    assert.equal(model.length === 0, scene.exterior.kind === 'clear');
    for (const face of model) for (const v of face.vertices) assert.ok(Object.values(v).every(Number.isFinite));
    const initial = exteriorPose(scene, 0), later = exteriorPose(scene, 1000);
    if (['hull', 'nacelle'].includes(scene.exterior.kind)) assert.deepEqual(initial, later);
    else {
      assert.ok(Math.abs(initial.x - later.x) <= 0.09);
      assert.ok(Math.abs(initial.y - later.y) <= 0.05);
    }
  }
});

test('exteriors draw bounded finite geometry at desktop and portrait sizes', () => {
  let paths = 0;
  const context = new Proxy({}, {
    get: (_, key) => (...args) => {
      if (key === 'moveTo' || key === 'lineTo') {
        assert.ok(args.every(Number.isFinite));
        assert.ok(args.every(n => Math.abs(n) < 10000));
        paths++;
      }
    },
    set: () => true,
  });
  for (let seed = 0; seed < 60; seed++) {
    const scene = createScene(String(seed));
    const model = buildExterior(scene);
    for (const [w, h] of [[900, 600], [320, 700]]) {
      drawExterior(context, scene, model, w, h, 123, 1);
    }
  }
  assert.ok(paths > 1000);
});
