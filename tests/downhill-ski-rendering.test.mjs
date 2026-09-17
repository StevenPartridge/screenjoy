import assert from "node:assert/strict";
import test from "node:test";
import { DownhillSkiElement } from "../packages/downhill-ski/dist/downhill-ski.js";

// Record the actual Canvas paths after the sprite's transforms.
function recordingContext() {
  let rotation = 0;
  const stack = [];
  let previous;
  let segments = [];
  const strokes = [];
  const context = new Proxy({
    strokes,
    save() { stack.push(rotation); },
    restore() { rotation = stack.pop(); },
    rotate(angle) { rotation += angle; },
    beginPath() { segments = []; previous = undefined; },
    moveTo(x, y) { previous = [x, y]; },
    lineTo(x, y) {
      if (previous) {
        const dx = x - previous[0];
        const dy = y - previous[1];
        segments.push([
          dx * Math.cos(rotation) - dy * Math.sin(rotation),
          dx * Math.sin(rotation) + dy * Math.cos(rotation),
        ]);
      }
      previous = [x, y];
    },
    stroke() { strokes.push({ color: context.strokeStyle, segments: [...segments] }); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return context;
}

test("player and yeti sort between obstacles at their ground position", () => {
  const ski = Object.create(DownhillSkiElement.prototype);
  const order = [];
  Object.assign(ski, {
    distance: 30, yetiY: 20, yetiActive: true,
    obstacles: [{ y: 40 }, { y: 10 }],
    drawSnow() {}, drawHud() {}, drawIntro() {}, drawGameOver() {},
    drawObstacle(obstacle) { order.push(obstacle.y); },
    drawPlayer() { order.push("player"); },
    drawYeti() { order.push("yeti"); },
  });
  ski.drawFrame();
  assert.deepEqual(order, [10, "yeti", "player", 40]);
});

test("ski tracks stop in the air, resume after landing, and remain bounded", () => {
  const ski = Object.create(DownhillSkiElement.prototype);
  Object.assign(ski, {
    tracks: [], nextTrackAt: 0, trackStart: true, runSeconds: 0,
    playerX: 0, distance: 0, heading: 0, jumpHeight: 0, crashTimer: 0,
    gameOver: false,
  });
  ski.recordTracks();
  ski.runSeconds = 1;
  ski.jumpHeight = 5;
  ski.recordTracks();
  assert.equal(ski.tracks.length, 1);
  ski.jumpHeight = 0;
  ski.recordTracks();
  assert.equal(ski.tracks[1].start, true, "no track across a jump");
  for (let i = 2; i < 1000; i++) {
    ski.runSeconds = i;
    ski.distance = i / 10;
    ski.recordTracks();
  }
  assert.ok(ski.tracks.length <= 180);
  assert.ok(ski.tracks.every((point) => point.y > ski.distance - 45));
});

for (const heading of [0, -0.7, 0.7]) {
  test(`skis align with downhill travel at heading ${heading}`, () => {
    const skier = Object.create(DownhillSkiElement.prototype);
    skier.context = recordingContext();
    skier.drawSkier(0, 0, 1, heading, 0, false);
    const rails = skier.context.strokes
      .filter(({ color }) => color === "#1c2933")
      .flatMap(({ segments }) => segments)
      .filter(([x, y]) => Math.hypot(x, y) > 10);
    assert.equal(rails.length, 2, "two distinct ski rails");
    const travel = [Math.sin(heading) * 1.25, Math.cos(heading)];
    for (const [x, y] of rails) {
      const alignment = (x * travel[0] + y * travel[1]) /
        (Math.hypot(x, y) * Math.hypot(...travel));
      assert.ok(alignment > 0.99, `ski must point along travel, alignment=${alignment}`);
    }
  });
}
