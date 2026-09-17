import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function createInspectableElement(ElementClass) {
  const element = Object.create(ElementClass.prototype);
  const attributes = new Map();
  element.setAttribute = (name, value) => {
    attributes.set(name, String(value));
  };
  element.getAttribute = (name) => attributes.get(name) ?? null;
  element.removeAttribute = (name) => {
    attributes.delete(name);
  };
  return element;
}

test("Game of Life properties support assignment from React", async () => {
  const { GameOfLifeElement } = await import(
    "../packages/game-of-life/dist/game-of-life.js"
  );
  const life = createInspectableElement(GameOfLifeElement);

  life.speed = "1.75";
  life.density = "0.31";

  assert.equal(life.getAttribute("speed"), "1.75");
  assert.equal(life.speed, 1.75);
  assert.equal(life.getAttribute("density"), "0.31");
  assert.equal(life.density, 0.31);
});

test("Game of Life follows Conway's B3/S23 rules", async () => {
  const { stepLifeGrid } = await import(
    "../packages/game-of-life/dist/game-of-life.js"
  );
  const columns = 5;
  const rows = 5;
  const verticalBlinker = new Uint8Array(columns * rows);
  verticalBlinker[1 * columns + 2] = 1;
  verticalBlinker[2 * columns + 2] = 1;
  verticalBlinker[3 * columns + 2] = 1;
  const horizontalBlinker = new Uint8Array(columns * rows);

  const result = stepLifeGrid(
    verticalBlinker,
    horizontalBlinker,
    columns,
    rows,
  );

  assert.deepEqual(
    [...horizontalBlinker],
    [
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 1, 2, 1, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ],
  );
  assert.deepEqual(result, { changed: 4, population: 3 });
});

test("Game of Life detects repeating patterns without treating age as state", async () => {
  const { GameOfLifeElement, lifeStateKey } = await import(
    "../packages/game-of-life/dist/game-of-life.js"
  );
  const columns = 5;
  const rows = 5;
  const blinker = new Uint8Array(columns * rows);
  blinker[1 * columns + 2] = 1;
  blinker[2 * columns + 2] = 1;
  blinker[3 * columns + 2] = 1;
  const agedBlinker = Uint8Array.from(blinker, (cell) => cell * 17);

  assert.equal(lifeStateKey(blinker), lifeStateKey(agedBlinker));

  const life = createInspectableElement(GameOfLifeElement);
  Object.assign(life, {
    columns,
    rows,
    cells: blinker,
    nextCells: new Uint8Array(columns * rows),
    trails: new Uint8Array(columns * rows),
    generation: 0,
    population: 3,
    stillGenerations: 0,
    sparseGenerations: 0,
    stateHistory: new Map(),
    stateOrder: [],
    loopDetectedAt: -1,
    loopPeriod: 0,
    needsDraw: false,
  });
  let advancedSeeds = 0;
  life.advanceSeed = () => {
    advancedSeeds += 1;
  };
  life.rememberCurrentState();

  life.advanceGeneration();
  assert.equal(life.needsDraw, true);
  assert.equal(life.loopDetectedAt, -1);
  life.advanceGeneration();
  assert.equal(life.loopPeriod, 2);

  for (let generation = 0; generation < 18; generation += 1) {
    life.advanceGeneration();
  }
  assert.equal(advancedSeeds, 1);
});

test("Game of Life skips canvas work between unchanged generations", async () => {
  const { GameOfLifeElement } = await import(
    "../packages/game-of-life/dist/game-of-life.js"
  );
  const life = Object.create(GameOfLifeElement.prototype);
  life.needsDraw = false;
  Object.defineProperty(life, "context", {
    get() {
      throw new Error("unchanged frames must not touch the canvas");
    },
  });

  assert.doesNotThrow(() => life.drawFrame());
});

test("automatic Game of Life restarts increment and announce the seed", async () => {
  const { GameOfLifeElement } = await import(
    "../packages/game-of-life/dist/game-of-life.js"
  );
  const life = createInspectableElement(GameOfLifeElement);
  const events = [];
  let resets = 0;
  life.setAttribute("seed", "41");
  life.resetScene = () => {
    resets += 1;
  };
  life.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };

  life.advanceSeed();

  assert.equal(life.getAttribute("seed"), "42");
  assert.equal(resets, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "seedchange");
  assert.deepEqual(events[0].detail, { seed: 42 });
});

test("Game of Life is an independent deterministic canvas saver", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/game-of-life/package.json", import.meta.url),
      "utf8",
    ),
  );
  const implementation = await readFile(
    new URL("../packages/game-of-life/dist/game-of-life.js", import.meta.url),
    "utf8",
  );

  assert.deepEqual(packageJson.dependencies, {
    "@screenjoy/runtime": "0.1.0",
  });
  assert.match(implementation, /CanvasSaverElement/);
  assert.match(implementation, /stepLifeGrid/);
  assert.match(implementation, /lifeStateKey/);
  assert.match(implementation, /neighbors === 3/);
  assert.match(implementation, /seedFrom/);
  assert.doesNotMatch(
    implementation,
    /@screenjoy\/(?:brick-maze|pipes|fishtank|downhill-ski|fractal-generator|code-rain)/i,
  );
});
