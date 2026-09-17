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
  element.hasAttribute = (name) => attributes.has(name);
  return element;
}

function createSkiPhysicsHarness(ElementClass) {
  const ski = createInspectableElement(ElementClass);
  Object.assign(ski, {
    obstacles: [],
    tracks: [],
    nextTrackAt: 0,
    trackStart: true,
    keys: new Set(),
    playerX: 0,
    distance: 0,
    heading: 0,
    targetHeading: 0,
    throttle: 0,
    runSeconds: 0,
    score: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    spin: 0,
    spinVelocity: 0,
    crashTimer: 0,
    invulnerableTimer: 0,
    introTimer: 0,
    gameOver: false,
    pointerActive: false,
    pointerControlEnabled: false,
    restartCountdown: 0,
    lastInputAt: 0,
  });
  ski.updateAutopilot = () => {};
  ski.updateMovingObstacles = () => {};
  ski.generateCourse = () => {};
  ski.checkGates = () => {};
  ski.checkCollisions = () => {};
  ski.updateYeti = () => {};
  ski.saveBest = () => {};
  return ski;
}

test("fullscreen sizing adds pixels without changing saver composition", async () => {
  const { resolveCanvasSize } = await import(
    "../packages/runtime/dist/index.js"
  );
  const sizing = {
    width: 1920,
    height: 1080,
    resolutionScale: 0.82,
    maxWidth: 720,
    maxHeight: 480,
    devicePixelRatio: 1,
  };

  assert.deepEqual(resolveCanvasSize(sizing), {
    layoutWidth: 720,
    layoutHeight: 405,
    renderWidth: 720,
    renderHeight: 405,
  });
  assert.deepEqual(
    resolveCanvasSize({
      ...sizing,
      fullscreenPixelBudget: 1920 * 1080,
    }),
    {
      layoutWidth: 720,
      layoutHeight: 405,
      renderWidth: 1920,
      renderHeight: 1080,
    },
  );
  assert.deepEqual(
    resolveCanvasSize({
      ...sizing,
      width: 1280,
      height: 720,
      devicePixelRatio: 2,
      fullscreenPixelBudget: 1920 * 1080,
    }),
    {
      layoutWidth: 720,
      layoutHeight: 405,
      renderWidth: 1920,
      renderHeight: 1080,
    },
  );
});

test("fullscreen quality protects the expensive renderers", async () => {
  const [{ BrickMazeElement }, { FractalGeneratorElement }] =
    await Promise.all([
      import("../packages/brick-maze/dist/brick-maze.js"),
      import("../packages/fractal-generator/dist/fractal-generator.js"),
    ]);
  const maze = createInspectableElement(BrickMazeElement);
  const fractal = createInspectableElement(FractalGeneratorElement);

  assert.equal(
    maze.fullscreenPixelBudget,
    null,
    "the CPU raycaster should retain its deliberate pixel budget",
  );
  assert.equal(
    fractal.fullscreenFpsCap,
    12,
    "the fractal should spend its fullscreen budget on pixels, not frame rate",
  );
});

test("saver numeric properties support assignment from React", async () => {
  const [
    { BrickMazeElement },
    { CodeRainElement },
    { PipesSaverElement },
    { FishTankElement },
    { DownhillSkiElement },
    { FractalGeneratorElement },
  ] =
    await Promise.all([
      import("../packages/brick-maze/dist/brick-maze.js"),
      import("../packages/code-rain/dist/code-rain.js"),
      import("../packages/pipes/dist/pipes-saver.js"),
      import("../packages/fishtank/dist/fish-tank.js"),
      import("../packages/downhill-ski/dist/downhill-ski.js"),
      import("../packages/fractal-generator/dist/fractal-generator.js"),
  ]);
  const maze = createInspectableElement(BrickMazeElement);
  const rain = createInspectableElement(CodeRainElement);
  const pipes = createInspectableElement(PipesSaverElement);
  const tank = createInspectableElement(FishTankElement);
  const ski = createInspectableElement(DownhillSkiElement);
  const fractal = createInspectableElement(FractalGeneratorElement);

  maze.speed = "1.25";
  maze.fps = "24";
  rain.speed = "1.3";
  rain.density = "1.25";
  pipes.speed = "1.4";
  pipes.density = "0.8";
  pipes.mode = "single";
  tank.speed = "0.75";
  tank.population = "13";
  ski.speed = "1.2";
  ski.mode = "freestyle";
  fractal.speed = "0.55";
  fractal.mode = "burning-ship";

  assert.equal(maze.getAttribute("speed"), "1.25");
  assert.equal(maze.speed, 1.25);
  assert.equal(maze.getAttribute("fps"), "24");
  assert.equal(maze.fps, 24);
  assert.equal(rain.getAttribute("speed"), "1.3");
  assert.equal(rain.speed, 1.3);
  assert.equal(rain.getAttribute("density"), "1.25");
  assert.equal(rain.density, 1.25);
  assert.equal(pipes.getAttribute("speed"), "1.4");
  assert.equal(pipes.speed, 1.4);
  assert.equal(pipes.getAttribute("density"), "0.8");
  assert.equal(pipes.density, 0.8);
  assert.equal(pipes.getAttribute("mode"), "single");
  assert.equal(pipes.mode, "single");
  assert.equal(tank.getAttribute("speed"), "0.75");
  assert.equal(tank.speed, 0.75);
  assert.equal(tank.getAttribute("population"), "13");
  assert.equal(tank.population, 13);
  assert.equal(ski.getAttribute("speed"), "1.2");
  assert.equal(ski.speed, 1.2);
  assert.equal(ski.getAttribute("mode"), "freestyle");
  assert.equal(ski.mode, "freestyle");
  assert.equal(fractal.getAttribute("speed"), "0.55");
  assert.equal(fractal.speed, 0.55);
  assert.equal(fractal.getAttribute("mode"), "burning-ship");
  assert.equal(fractal.mode, "burning-ship");
});

test("Code Rain is an independent deterministic canvas saver", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/code-rain/package.json", import.meta.url),
      "utf8",
    ),
  );
  const implementation = await readFile(
    new URL("../packages/code-rain/dist/code-rain.js", import.meta.url),
    "utf8",
  );

  assert.deepEqual(packageJson.dependencies, {
    "@screenjoy/runtime": "0.1.0",
  });
  assert.match(implementation, /CanvasSaverElement/);
  assert.match(implementation, /katakana|[ア-ン]/i);
  assert.match(implementation, /seedFrom/);
  assert.match(implementation, /density/);
  assert.doesNotMatch(
    implementation,
    /@screenjoy\/(?:brick-maze|pipes|fishtank|downhill-ski|fractal-generator)/i,
  );
});

test("the Fractal Generator is an independent WebGL saver", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/fractal-generator/package.json", import.meta.url),
      "utf8",
    ),
  );
  const implementation = await readFile(
    new URL(
      "../packages/fractal-generator/dist/fractal-generator.js",
      import.meta.url,
    ),
    "utf8",
  );

  assert.deepEqual(packageJson.dependencies, {
    "@screenjoy/runtime": "0.1.0",
  });
  assert.match(implementation, /getContext\("webgl"/);
  assert.match(implementation, /mandelbrot/);
  assert.match(implementation, /burning-ship/);
  assert.doesNotMatch(
    implementation,
    /@screenjoy\/(?:brick-maze|pipes|fishtank|downhill-ski)/i,
  );
});

test("Downhill Ski is an independent, fully playable canvas package", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/downhill-ski/package.json", import.meta.url),
      "utf8",
    ),
  );
  const implementation = await readFile(
    new URL("../packages/downhill-ski/dist/downhill-ski.js", import.meta.url),
    "utf8",
  );

  assert.deepEqual(packageJson.dependencies, {
    "@screenjoy/runtime": "0.1.0",
  });
  assert.match(implementation, /2000/);
  assert.match(implementation, /free-ride/);
  assert.match(implementation, /tree-slalom/);
  assert.match(implementation, /handlePointerDown/);
  assert.match(implementation, /handleKeyDown/);
  assert.doesNotMatch(
    implementation,
    /@screenjoy\/(?:brick-maze|pipes|fishtank)/i,
  );
});

test("Powder Run keeps the whole pace range lively", async () => {
  const { DownhillSkiElement } = await import(
    "../packages/downhill-ski/dist/downhill-ski.js"
  );
  const lowPace = createSkiPhysicsHarness(DownhillSkiElement);
  lowPace.speed = "0.8";
  lowPace.updateFrame(0.05);

  const highPace = createSkiPhysicsHarness(DownhillSkiElement);
  highPace.speed = "2.2";
  highPace.throttle = 1;
  highPace.updateFrame(0.05);

  assert.ok(
    lowPace.distance / 0.05 >= 18,
    "even the lowest pace should feel like a committed downhill run",
  );
  assert.ok(
    highPace.distance / 0.05 >= 60,
    "the high pace should deliver an unmistakably fast tuck",
  );
});

test("one trick input has enough airtime and rotation to score", async () => {
  const { DownhillSkiElement } = await import(
    "../packages/downhill-ski/dist/downhill-ski.js"
  );
  const ski = createSkiPhysicsHarness(DownhillSkiElement);
  ski.tryJump();

  let airborneFrames = 0;
  while ((ski.jumpVelocity > 0 || ski.jumpHeight > 0) && airborneFrames < 240) {
    ski.updateFrame(1 / 60);
    airborneFrames += 1;
  }

  assert.ok(airborneFrames >= 85, "a manual trick needs readable hang time");
  assert.equal(ski.crashTimer, 0, "one trick input should land cleanly");
  assert.ok(ski.score >= 400, "one complete rotation should earn trick points");
});

test("Powder Run restarts itself into autopilot after ten seconds", async () => {
  const { DownhillSkiElement } = await import(
    "../packages/downhill-ski/dist/downhill-ski.js"
  );
  const ski = createSkiPhysicsHarness(DownhillSkiElement);
  ski.gameOver = true;
  ski.restartCountdown = 10;
  ski.pointerControlEnabled = true;
  ski.lastInputAt = 42;
  ski.requestDraw = () => {};

  for (let frame = 0; frame < 599; frame += 1) {
    ski.updateFrame(1 / 60);
  }
  assert.equal(ski.gameOver, true, "the result screen should remain for ten seconds");

  ski.updateFrame(2 / 60);
  assert.equal(ski.gameOver, false, "the next run should start automatically");
  assert.equal(ski.pointerControlEnabled, false, "the new run should use autopilot");
  assert.equal(ski.lastInputAt, -10, "autosteering should engage immediately");
});

test("Powder Run ignores incidental pointer movement until a deliberate click", async () => {
  const { DownhillSkiElement } = await import(
    "../packages/downhill-ski/dist/downhill-ski.js"
  );
  const ski = createSkiPhysicsHarness(DownhillSkiElement);

  assert.equal(ski.shouldAcceptPointerMove("mouse"), false);
  ski.pointerControlEnabled = true;
  assert.equal(ski.shouldAcceptPointerMove("mouse"), true);
  assert.equal(ski.shouldAcceptPointerMove("touch"), false);
  ski.pointerActive = true;
  assert.equal(ski.shouldAcceptPointerMove("touch"), true);
});

test("the Fishtank package is an independent Three.js saver", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/fishtank/package.json", import.meta.url),
      "utf8",
    ),
  );
  const [implementation, modelFactory] = await Promise.all([
    readFile(
      new URL("../packages/fishtank/dist/fish-tank.js", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../packages/fishtank/dist/fish-models.js", import.meta.url),
      "utf8",
    ),
  ]);

  assert.deepEqual(packageJson.dependencies, {
    "@screenjoy/runtime": "0.1.0",
    three: "^0.185.1",
  });
  assert.match(implementation, /new WebGLRenderer/);
  assert.match(implementation, /new InstancedMesh/);
  assert.match(implementation, /new GLTFLoader/);
  assert.match(implementation, /models\/angel\.glb/);
  assert.doesNotMatch(
    implementation,
    /^const FISH_MODEL_URLS\s*=/m,
    "model URLs must not be constructed while the server imports the module",
  );
  assert.doesNotMatch(
    implementation,
    /tail instanceof Group/,
    "GLTFLoader restores named animation pivots as Object3D nodes",
  );
  assert.match(
    implementation,
    /loadFishTemplates\(\)[\s\S]*?\.then\(populate\)[\s\S]*?\.catch\(/,
    "fish setup must handle async spawning failures",
  );
  assert.match(modelFactory, /vertexColors:\s*true|vertexColors = true/);
  assert.match(modelFactory, /"angel"/);
  assert.match(modelFactory, /"tang"/);
  assert.match(modelFactory, /"clown"/);
  assert.match(modelFactory, /"butterfly"/);
  assert.doesNotMatch(modelFactory, /TorusGeometry/);
  assert.doesNotMatch(
    implementation,
    /@screenjoy\/(?:brick-maze|pipes)|registerBrickMaze|registerPipes/i,
  );
});

test("every Fishtank species has a Blender-editable GLB contract", async () => {
  const [{ GLTFLoader }, { FishTankElement }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("../packages/fishtank/dist/fish-tank.js"),
  ]);
  const archetypes = [
    "angel",
    "tang",
    "clown",
    "butterfly",
    "mint",
    "ruby",
    "tetra",
  ];

  for (const archetype of archetypes) {
    const model = await readFile(
      new URL(`../packages/fishtank/models/${archetype}.glb`, import.meta.url),
    );
    assert.equal(model.subarray(0, 4).toString("utf8"), "glTF");
    assert.equal(model.readUInt32LE(4), 2);
    assert.equal(model.readUInt32LE(16), 0x4e4f534a);

    const jsonLength = model.readUInt32LE(12);
    const json = JSON.parse(
      model
        .subarray(20, 20 + jsonLength)
        .toString("utf8")
        .trim(),
    );
    const nodeNames = new Set(json.nodes.map((node) => node.name));

    assert.ok(nodeNames.has("Body"), `${archetype} is missing Body`);
    assert.ok(nodeNames.has("Tail"), `${archetype} is missing Tail`);
    assert.ok(
      nodeNames.has("FinPectoralL"),
      `${archetype} is missing FinPectoralL`,
    );
    assert.ok(
      nodeNames.has("FinPectoralR"),
      `${archetype} is missing FinPectoralR`,
    );

    const arrayBuffer = model.buffer.slice(
      model.byteOffset,
      model.byteOffset + model.byteLength,
    );
    const gltf = await new GLTFLoader().parseAsync(arrayBuffer, "");
    assert.ok(gltf.scene.getObjectByName("Body"));
    const tail = gltf.scene.getObjectByName("Tail");
    assert.ok(tail);
    assert.equal(
      tail.type,
      "Object3D",
      `${archetype} Tail should remain a valid generic animation pivot`,
    );

    const tank = createInspectableElement(FishTankElement);
    tank.fishTemplates = new Map([
      [
        archetype,
        gltf.scene.getObjectByName(`Fish_${archetype}`) ?? gltf.scene,
      ],
    ]);
    tank.random = () => 0.5;
    const visual = tank.createLoadedFishVisual(archetype);
    assert.equal(visual.tail.name, "Tail");
  }
});

test("normal Fishtank builds preserve hand-edited source models", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/fishtank/package.json", import.meta.url),
      "utf8",
    ),
  );

  assert.match(packageJson.scripts.build, /copy-models/);
  assert.doesNotMatch(packageJson.scripts.build, /export-fish-models/);
});

test("the Pipes package depends on the runtime, not another saver", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/pipes/package.json", import.meta.url),
      "utf8",
    ),
  );
  const implementation = await readFile(
    new URL("../packages/pipes/dist/pipes-saver.js", import.meta.url),
    "utf8",
  );

  assert.deepEqual(packageJson.dependencies, {
    "@screenjoy/runtime": "0.1.0",
    three: "^0.185.1",
  });
  assert.doesNotMatch(implementation, /brick-maze|@screenjoy\/brick-maze/i);
  assert.match(implementation, /new InstancedMesh/);
  assert.doesNotMatch(
    implementation,
    /createLinearGradient|createRadialGradient|backgroundLayer/,
  );
});

test("Pipes joint geometry stays close to the pipe radius", async () => {
  const implementation = await readFile(
    new URL("../packages/pipes/dist/pipes-saver.js", import.meta.url),
    "utf8",
  );
  const pipeRadius = Number(
    implementation.match(/new CylinderGeometry\(([\d.]+)/)?.[1],
  );
  const jointRadius = Number(
    implementation.match(/new SphereGeometry\(([\d.]+)/)?.[1],
  );

  const radiusRatio = jointRadius / pipeRadius;
  assert.ok(radiusRatio >= 1 && radiusRatio <= 1.06);
});

test("Pipes instance colors are not blacked out by missing vertex colors", async () => {
  const implementation = await readFile(
    new URL("../packages/pipes/dist/pipes-saver.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(implementation, /vertexColors:\s*true/);
  assert.match(implementation, /\.setColorAt\(/);
});

test("Pipes depth fog keeps the back of the volume visible", async () => {
  const implementation = await readFile(
    new URL("../packages/pipes/dist/pipes-saver.js", import.meta.url),
    "utf8",
  );
  const fogMatch = implementation.match(
    /new Fog\(0x030303,\s*([\d.]+),\s*([\d.]+)\)/,
  );
  const ambientMatch = implementation.match(
    /new AmbientLight\(0xffffff,\s*([\d.]+)\)/,
  );

  assert.ok(fogMatch);
  assert.ok(ambientMatch);
  const fogNear = Number(fogMatch[1]);
  const fogFar = Number(fogMatch[2]);
  const farthestCornerDistance = Math.hypot(14.5, 12.5, 17.5);
  const farthestFogAmount =
    (farthestCornerDistance - fogNear) / (fogFar - fogNear);

  assert.ok(farthestFogAmount <= 0.55);
  assert.ok(Number(ambientMatch[1]) >= 0.4);
});

test("Pipes camera frames the structure more tightly", async () => {
  const implementation = await readFile(
    new URL("../packages/pipes/dist/pipes-saver.js", import.meta.url),
    "utf8",
  );
  const cameraMatch = implementation.match(
    /camera\.position\.set\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/,
  );

  assert.ok(cameraMatch);
  const cameraDistance = Math.hypot(
    Number(cameraMatch[1]),
    Number(cameraMatch[2]),
    Number(cameraMatch[3]),
  );
  assert.ok(cameraDistance < 18);
});

test("maze movement carries smoothly across a straight tile boundary", async () => {
  const { BrickMazeElement } = await import(
    "../packages/brick-maze/dist/brick-maze.js"
  );
  const maze = createInspectableElement(BrickMazeElement);
  maze.speed = 1;
  maze.grid = Array.from({ length: 5 }, () => Array(5).fill(1));
  maze.grid[1][1] = 0;
  maze.grid[1][2] = 0;
  maze.grid[1][3] = 0;
  maze.random = () => 0;
  maze.camera = {
    x: 2.45,
    y: 1.5,
    angle: 0,
    cellX: 1,
    cellY: 1,
    heading: 0,
    targetAngle: 0,
    progress: 0.95,
    phase: "move",
  };

  maze.updateFrame(0.1);

  assert.equal(maze.camera.phase, "move");
  assert.equal(maze.camera.cellX, 2);
  assert.ok(Math.abs(maze.camera.progress - 0.05) < 1e-9);
  assert.ok(Math.abs(maze.camera.x - 2.55) < 1e-9);
});

test("maze floor seams stay close to the surrounding tile brightness", async () => {
  const { BrickMazeElement } = await import(
    "../packages/brick-maze/dist/brick-maze.js"
  );
  const maze = Object.create(BrickMazeElement.prototype);
  maze.canvas = { width: 64, height: 64 };
  maze.camera = { x: 1.5, y: 1.5, angle: 0 };
  maze.pixels = new Uint8ClampedArray(64 * 64 * 4);

  maze.paintFloorAndCeiling();

  const redValues = Array.from({ length: 64 }, (_, x) => {
    return maze.pixels[(48 * 64 + x) * 4];
  });
  assert.ok(Math.min(...redValues) >= 60);
});

test("dense Pipes scenes update only the active GPU instance", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);
  const activeSegment = {
    from: { x: -1, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    color: 0,
    progress: 0.5,
  };
  let matrixUpdates = 0;

  pipes.segments = [
    ...Array.from({ length: 119 }, (_, index) => {
      const x = (index % 9) - 4;
      const y = (Math.floor(index / 9) % 9) - 4;
      const z = (Math.floor(index / 27) % 9) - 4;
      return {
        from: { x, y, z },
        to: { x: x + 1, y, z },
        color: index % 6,
        progress: 1,
      };
    }),
    activeSegment,
  ];
  pipes.activeSegment = activeSegment;
  pipes.resetCountdown = -1;
  pipes.segmentMesh = {
    count: 120,
    instanceMatrix: { needsUpdate: false },
    instanceColor: { needsUpdate: false },
    setMatrixAt() {
      matrixUpdates += 1;
    },
    setColorAt() {},
  };

  pipes.updateFrame(0.01);

  assert.equal(matrixUpdates, 1);
  assert.equal(pipes.segmentMesh.count, 120);
});

test("Pipes wayfinding avoids a locally trapped next step", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);

  pipes.mode = "single";
  pipes.random = () => 0;
  pipes.resetCountdown = -1;
  pipes.currentPosition = { x: 0, y: 0, z: 0 };
  pipes.currentDirection = 0;
  pipes.currentColor = 0;
  pipes.segments = [];
  pipes.joints = [];
  pipes.occupied = new Set([
    "0,0,0",
    "-1,0,0",
    "0,-1,0",
    "0,0,1",
    "0,0,-1",
    "2,0,0",
    "1,1,0",
    "1,-1,0",
    "1,0,1",
    "1,0,-1",
  ]);

  pipes.queueNextSegment();

  assert.deepEqual(pipes.activeSegment.to, { x: 0, y: 1, z: 0 });
});

test("Pipes transitions to cleanup at its bounded segment limit", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);
  const activeSegment = {
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: 0, z: 0 },
    color: 0,
    progress: 0.99,
  };

  pipes.setAttribute("seed", "95");
  pipes.density = 1;
  pipes.canvas = { style: { opacity: "1" } };
  pipes.segments = Array.from({ length: pipes.segmentLimit }, () => ({
    ...activeSegment,
  }));
  pipes.activeSegment = activeSegment;
  pipes.currentPosition = { x: 0, y: 0, z: 0 };
  pipes.currentPipeLength = 1;
  pipes.targetPipeLength = 20;
  pipes.occupied = new Set();
  pipes.resetCountdown = -1;

  pipes.updateFrame(0.1);

  assert.equal(pipes.resetCountdown, 1.25);
  assert.equal(pipes.segmentLimit, 400);
  assert.ok(pipes.segments.length <= pipes.segmentLimit);

  for (let frame = 0; frame < 200; frame += 1) {
    pipes.updateFrame(0.02);
  }

  assert.equal(pipes.getAttribute("seed"), "96");
});

test("single Pipes mode celebrates its final frame, then advances", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);
  const activeSegment = {
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: 0, z: 0 },
    color: 0,
    progress: 0.99,
  };

  pipes.setAttribute("seed", "95");
  pipes.mode = "single";
  pipes.density = 1;
  pipes.canvas = { style: { opacity: "1" } };
  pipes.segments = Array.from({ length: pipes.segmentLimit }, () => ({
    ...activeSegment,
  }));
  pipes.activeSegment = activeSegment;
  pipes.currentPosition = { x: 0, y: 0, z: 0 };
  pipes.currentPipeLength = pipes.segmentLimit - 1;
  pipes.targetPipeLength = pipes.segmentLimit;
  pipes.occupied = new Set();
  pipes.resetCountdown = -1;

  pipes.updateFrame(0.1);
  assert.equal(pipes.complete, true);
  assert.equal(pipes.resetCountdown > 1.25, true);

  for (let frame = 0; frame < 400; frame += 1) {
    pipes.updateFrame(0.02);
  }

  assert.equal(pipes.complete, false);
  assert.equal(pipes.resetCountdown, -1);
  assert.equal(pipes.getAttribute("seed"), "96");
  assert.equal(pipes.canvas.style.opacity, "1");
});

test("single Pipes mode restarts with the next seed after a dead end", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);

  pipes.setAttribute("seed", "95");
  pipes.mode = "single";
  pipes.canvas = { style: { opacity: "1" } };
  pipes.segments = [];
  pipes.joints = [];
  pipes.activeSegment = undefined;
  pipes.currentPosition = { x: 0, y: 0, z: 0 };
  pipes.currentDirection = 0;
  pipes.occupied = new Set([
    "0,0,0",
    "1,0,0",
    "-1,0,0",
    "0,1,0",
    "0,-1,0",
    "0,0,1",
    "0,0,-1",
  ]);
  pipes.resetCountdown = -1;
  pipes.complete = false;

  pipes.queueNextSegment();

  assert.equal(pipes.complete, false);
  assert.equal(pipes.resetCountdown >= 0, true);

  for (let frame = 0; frame < 200; frame += 1) {
    pipes.updateFrame(0.02);
  }

  assert.equal(pipes.getAttribute("seed"), "96");
  assert.equal(pipes.resetCountdown, -1);
});

test("single Pipes success includes an on-screen celebration", async () => {
  const implementation = await readFile(
    new URL("../packages/pipes/dist/pipes-saver.js", import.meta.url),
    "utf8",
  );

  assert.match(implementation, /COOLEST SEED FOUND/);
});

test("single Pipes mode grows one continuous pipe", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);
  const createMesh = () => ({
    count: 0,
    instanceMatrix: { needsUpdate: false },
    instanceColor: { needsUpdate: false },
    setMatrixAt() {},
    setColorAt() {},
  });

  pipes.setAttribute("seed", "95");
  pipes.speed = 3;
  pipes.density = 1;
  pipes.mode = "single";
  pipes.canvas = { style: {} };
  pipes.segmentMesh = createMesh();
  pipes.jointMesh = createMesh();
  pipes.resetScene();

  const initialColor = pipes.currentColor;
  for (
    let frame = 0;
    frame < 5_000 && pipes.resetCountdown < 0 && !pipes.complete;
    frame += 1
  ) {
    pipes.updateFrame(0.02);
  }

  assert.ok(pipes.segments.length > 19);
  assert.equal(pipes.segments.length, pipes.segmentLimit);
  assert.equal(pipes.targetPipeLength, pipes.segmentLimit);
  assert.deepEqual(
    new Set(pipes.segments.map((segment) => segment.color)),
    new Set([initialColor]),
  );

  assert.equal(pipes.complete, true);
  assert.equal(pipes.canvas.style.opacity, "1");
});

test("Pipes cleanup countdown cannot skip past the reset phase", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = createInspectableElement(PipesSaverElement);
  const createMesh = () => ({
    count: 0,
    instanceMatrix: { needsUpdate: false },
    instanceColor: { needsUpdate: false },
    setMatrixAt() {},
    setColorAt() {},
  });

  pipes.setAttribute("seed", "95");
  pipes.speed = 3;
  pipes.density = 1;
  pipes.canvas = { style: {} };
  pipes.segmentMesh = createMesh();
  pipes.jointMesh = createMesh();
  pipes.resetScene();

  let largestScene = 0;
  for (let frame = 0; frame < 6_000; frame += 1) {
    pipes.updateFrame(0.02);
    largestScene = Math.max(largestScene, pipes.segments.length);
  }

  assert.ok(largestScene <= pipes.segmentLimit);
});

test("detached Pipes elements release scene and GPU resources", async () => {
  const { PipesSaverElement } = await import(
    "../packages/pipes/dist/pipes-saver.js"
  );
  const pipes = Object.create(PipesSaverElement.prototype);
  const disposed = [];

  pipes.canvas = { style: {} };
  pipes.segments = [{ from: {}, to: {} }];
  pipes.joints = [{ position: {} }];
  pipes.occupied = new Set(["0,0,0"]);
  pipes.activeSegment = pipes.segments[0];
  pipes.scene = { clear: () => disposed.push("scene") };
  pipes.segmentGeometry = { dispose: () => disposed.push("segments") };
  pipes.jointGeometry = { dispose: () => disposed.push("joints") };
  pipes.segmentMaterial = { dispose: () => disposed.push("segment-material") };
  pipes.jointMaterial = { dispose: () => disposed.push("joint-material") };
  pipes.renderer = { dispose: () => disposed.push("renderer") };

  pipes.elementDidDisconnect();

  assert.equal(pipes.segments.length, 0);
  assert.equal(pipes.joints.length, 0);
  assert.equal(pipes.occupied.size, 0);
  assert.equal(pipes.activeSegment, undefined);
  assert.deepEqual(disposed, [
    "scene",
    "segments",
    "joints",
    "segment-material",
    "joint-material",
    "renderer",
  ]);
  assert.equal(pipes.renderer, undefined);
  assert.equal(pipes.segmentMesh, undefined);
  assert.equal(pipes.jointMesh, undefined);
});

test('ski best scores tolerate denied storage and reject invalid saved scores', async () => {
  const { DownhillSkiElement } = await import('../packages/downhill-ski/dist/downhill-ski.js');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const ski = createInspectableElement(DownhillSkiElement);
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
    assert.doesNotThrow(() => ski.loadBest());
    assert.equal(ski.best, 0);
    ski.score = 42;
    assert.doesNotThrow(() => ski.saveBest());
    assert.equal(ski.best, 42);
    for (const value of ['NaN', 'Infinity', '-12']) {
      Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{ getItem: () => value }});
      ski.loadBest();
      assert.equal(ski.best, 0);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
