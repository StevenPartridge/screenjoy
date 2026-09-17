import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Mesh, PerspectiveCamera, Scene, Vector3 } from "three";
import { createRandom, seedFrom } from "../packages/runtime/dist/index.js";
import { FishTankElement } from "../packages/fishtank/dist/fish-tank.js";
import { FISH_ARCHETYPES, createFishModel } from "../packages/fishtank/dist/fish-models.js";
import { createReefEnvironment } from "../packages/fishtank/dist/reef-environment.js";

function tankHarness(seed = "728", population = 11) {
  const tank = Object.create(FishTankElement.prototype);
  const attributes = new Map([["seed", seed], ["population", String(population)]]);
  tank.getAttribute = name => attributes.get(name) ?? null;
  tank.hasAttribute = name => attributes.has(name);
  tank.setAnimationSettled = () => {};
  tank.requestDraw = () => {};
  Object.assign(tank, {
    random: createRandom(seedFrom(seed)), elapsed: 0, sceneGeneration: 0, templateGeneration: 0,
    fish: [], fishTemplates: new Map(FISH_ARCHETYPES.map(type => [type, createFishModel(type).group])),
    bubbles: [], food: [], lastFeed: -10, scene: new Scene(), camera: new PerspectiveCamera(42, 1.6, 0.1, 65),
  });
  tank.camera.position.set(0, 1.3, 13.6);
  tank.camera.lookAt(0, 0.25, -0.6);
  tank.camera.updateMatrixWorld(true);
  return tank;
}

function release(tank) {
  tank.disposeScene();
  tank.disposeFishTemplates();
}

test("sculpted fish have finite geometry, outward body normals and animated fin pivots", () => {
  for (const type of FISH_ARCHETYPES) {
    const { group, tail, fins } = createFishModel(type);
    assert.equal(tail.name, "Tail");
    assert.equal(fins.length, 4);
    const body = group.getObjectByName("Body");
    const positions = body.geometry.getAttribute("position");
    const normals = body.geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) && Number.isFinite(positions.getZ(i)));
      assert.ok(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) > 0.95);
      if (Math.abs(positions.getY(i)) > 0.15) assert.ok(positions.getY(i) * normals.getY(i) > 0);
    }
    const bounds = new Box3().setFromObject(group);
    assert.ok(bounds.max.x < 0.9 && bounds.min.x > -1.6);
    const tank = tankHarness();
    tank.scene.add(group);
    release(tank);
  }
});

test("reef geometry stays within a small draw-call budget and animates without allocations of scene objects", () => {
  const tank = tankHarness();
  const reef = createReefEnvironment(tank.scene, tank.random);
  let meshCount = 0;
  tank.scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshCount++;
    for (const value of object.geometry.getAttribute("position").array) assert.ok(Number.isFinite(value));
  });
  assert.ok(meshCount < 50, `reef uses ${meshCount} mesh draws`);
  const children = tank.scene.children.length;
  for (let t = 0; t < 120; t += 0.1) reef.update(t);
  assert.equal(tank.scene.children.length, children);
  assert.equal(reef.obstacles.length, 2);
  release(tank);
});

test("maximum population remains finite and inside the tank during a long fast run", () => {
  const tank = tankHarness("reef-stress", 18);
  tank.reef = { obstacles: [{ center: new Vector3(-4.6, -1.65, -1.35), radius: 1.78 }, { center: new Vector3(4.55, -1.65, -2.1), radius: 1.46 }] };
  tank.fish = Array.from({ length: 18 }, (_, i) => tank.createFish(i));
  tank.scene.add(...tank.fish.map(fish => fish.group));
  let minimumRockClearance = Infinity;
  for (let frame = 0; frame < 3600; frame++) {
    tank.elapsed += 0.15;
    tank.updateFish(0.15);
    for (const fish of tank.fish) {
      assert.ok(fish.position.x >= -6.1 && fish.position.x <= 6.1);
      assert.ok(fish.position.y >= -1.9 && fish.position.y <= 3.1);
      assert.ok(fish.position.z >= -3.6 && fish.position.z <= 2.1);
      assert.ok(fish.velocity.length() < 1.2);
      assert.ok(Number.isFinite(fish.group.rotation.y));
      if (frame > 60) {
        for (const obstacle of tank.reef.obstacles) minimumRockClearance = Math.min(minimumRockClearance, fish.position.distanceTo(obstacle.center) - obstacle.radius);
      }
    }
  }
  assert.ok(minimumRockClearance > -0.1, `fish entered a rock by ${-minimumRockClearance}`);
  release(tank);
});

test("seeded swimming is reproducible", () => {
  const a = tankHarness("same-reef"), b = tankHarness("same-reef");
  for (const tank of [a, b]) {
    tank.fish = Array.from({ length: 11 }, (_, i) => tank.createFish(i));
    tank.scene.add(...tank.fish.map(fish => fish.group));
    for (let i = 0; i < 600; i++) { tank.elapsed += 1 / 30; tank.updateFish(1 / 30); }
  }
  assert.deepEqual(a.fish.map(fish => fish.position.toArray()), b.fish.map(fish => fish.position.toArray()));
  release(a); release(b);
});

test("feeding has a fixed particle limit, attracts fish and expires on the sand", () => {
  const tank = tankHarness();
  tank.buildFood();
  for (let i = 0; i < 10; i++) { tank.elapsed += 1; tank.feed(); }
  assert.equal(tank.food.length, 24);
  assert.equal(tank.foodMesh.count, 24);
  tank.fish = [tank.createFish(0)];
  tank.scene.add(tank.fish[0].group);
  const fish = tank.fish[0];
  fish.position.set(0, 1, 0.8); fish.velocity.set(0.5, 0, 0); fish.group.rotation.set(0, 0, 0);
  tank.food = [{ position: new Vector3(1.5, 1, 0.8), phase: 0 }];
  for (let i = 0; i < 300 && tank.food.length; i++) {
    tank.elapsed += 1 / 30; tank.updateFish(1 / 30); tank.updateFood(1 / 30);
  }
  assert.equal(tank.food.length, 0, "the fish should eat a nearby pellet");
  tank.food = [{ position: new Vector3(5, 2, 0.8), phase: 0 }];
  for (let i = 0; i < 1000; i++) tank.updateFood(0.05);
  assert.equal(tank.food.length, 0, "uneaten food must expire");
  release(tank);
});

test("restocking replaces the scene and releases particle GPU resources", async () => {
  const tank = tankHarness();
  tank.resetScene();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tank.fish.length, 11);
  const originalFish = tank.fish[0].group;
  let disposed = 0;
  tank.bubbleMesh.addEventListener("dispose", () => disposed++);
  tank.foodMesh.addEventListener("dispose", () => disposed++);
  tank.resetScene();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disposed, 2);
  assert.equal(tank.fish.length, 11);
  assert.ok(!tank.scene.children.includes(originalFish));
  assert.equal(tank.food.length, 0);
  release(tank);
});
