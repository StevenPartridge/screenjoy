import { createRandom, seedFrom } from "@screenjoy/runtime";

export type FlightMode = "cruise" | "ftl";
export type ViewDirection = "forward" | "port" | "starboard" | "aft";
export type Vec3 = { x: number; y: number; z: number };
export type Camera = { yaw: number; pitch: number; roll: number };
export type ExteriorKind = "clear" | "nacelle" | "hull" | "convoy" | "tow";
export const EXTERIOR_LABELS: Record<ExteriorKind, string> = {
  clear: "Open stars", nacelle: "Nacelle overlook", hull: "Across the promenade",
  convoy: "Travelling in company", tow: "Asteroid tow",
};
export type Star = { x: number; y: number; depth: number; size: number; tint: number; phase: number };
export const MATERIALS = [
  { name: "Brushed titanium", wall: "#252d38", light: "#61717e", rim: "#a2b5bf", lamp: "#a6e4eb" },
  { name: "Warm bronze", wall: "#302725", light: "#7c6250", rim: "#c2a07a", lamp: "#ffd7a1" },
  { name: "Porcelain", wall: "#42444a", light: "#94928c", rim: "#d9d3c6", lamp: "#ffe0b1" },
  { name: "Midnight alloy", wall: "#161d2b", light: "#3d4965", rim: "#7c8da7", lamp: "#b7c8ff" },
] as const;

export function createScene(seed: string) {
  const random = createRandom(seedFrom(`starliner-v1:${seed}`));
  random(); // Preserve the original window and material choices for existing seeds.
  const shape = (["panorama", "oval", "chamfered"] as const)[Math.floor(random() * 3)];
  const material = MATERIALS[Math.floor(random() * MATERIALS.length)];
  const pace = 0.75 + random() * 0.65;
  const hue = 190 + random() * 90;
  const focus = { x: 0.44 + random() * 0.12, y: 0.42 + random() * 0.12 };
  const stars: Star[] = Array.from({ length: 1500 + Math.floor(random() * 1000) }, () => ({
    x: random() * 6 - 3, y: random() * 4 - 2, depth: random(),
    size: 0.35 + random() * 0.9, tint: random(), phase: random() * Math.PI * 2,
  }));
  const clouds = Array.from({ length: 16 }, () => ({
    x: random(), y: random(), radius: 0.12 + random() * 0.3, hue: hue + random() * 45 - 20,
  }));
  // Separate random streams keep cabin identity independent of new exterior detail.
  const viewRandom = createRandom(seedFrom(`starliner-view-v2:${seed}`));
  const yaw = (viewRandom() * 2 - 1) * Math.PI;
  const pitch = (viewRandom() * 2 - 1) * 0.72;
  const roll = (viewRandom() * 2 - 1) * 0.2;
  const camera = { yaw, pitch, roll };
  const direction: ViewDirection = Math.abs(yaw) < Math.PI / 4 ? "forward"
    : Math.abs(yaw) > Math.PI * 0.75 ? "aft" : yaw < 0 ? "port" : "starboard";
  const facing = Math.abs(yaw) < 0.35 ? "Forward" : Math.abs(yaw) > 2.8 ? "Aft"
    : `${Math.abs(yaw) < Math.PI / 2 ? "Forward" : "Aft"} ${yaw < 0 ? "port" : "starboard"}`;
  const viewLabel = `${pitch > 0.25 ? "Upper" : pitch < -0.25 ? "Lower" : "Midship"} · ${facing.toLowerCase()}`;
  const pick = viewRandom();
  const kind: ExteriorKind = pick < 0.32 ? "clear" : pick < 0.58 ? "nacelle"
    : pick < 0.73 ? "hull" : pick < 0.94 ? "convoy" : "tow";
  const exterior = {
    kind, side: viewRandom() < 0.5 ? -1 : 1, scale: 0.85 + viewRandom() * 0.3,
    phase: viewRandom() * Math.PI * 2, hue: 175 + viewRandom() * 80,
    detailSeed: seedFrom(`starliner-exterior-v2:${seed}`),
  };
  return { direction, camera, viewLabel, exterior, shape, material, pace, hue, focus, stars, clouds };
}
export type Scene = ReturnType<typeof createScene>;
const wrap = (value: number, period: number) => ((value % period) + period) % period;

/** Rotate ship coordinates into a passenger's camera. +Z is the ship's heading. */
export function toCamera(point: Vec3, camera: Camera): Vec3 {
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const cr = Math.cos(camera.roll), sr = Math.sin(camera.roll);
  const right = cy * point.x - sy * point.z;
  const up = -sy * sp * point.x + cp * point.y - cy * sp * point.z;
  return {
    x: cr * right + sr * up,
    y: -sr * right + cr * up,
    z: sy * cp * point.x + sp * point.y + cy * cp * point.z,
  };
}

export function fromCamera(point: Vec3, camera: Camera): Vec3 {
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const cr = Math.cos(camera.roll), sr = Math.sin(camera.roll);
  const right = cr * point.x - sr * point.y;
  const up = sr * point.x + cr * point.y;
  return {
    x: cy * right - sy * sp * up + sy * cp * point.z,
    y: cp * up + sp * point.z,
    z: -sy * right - cy * sp * up + cy * cp * point.z,
  };
}

export const FOCAL_LENGTH = 0.78;
export const STAR_FIELD_SIZE = 24;

/** The same world translation drives every seat, including sideways and aft. */
export function projectStar(star: Star, scene: Scene, distance: number, trail: number, aspect: number) {
  const world = {
    x: star.x * 4, y: star.y * 6,
    z: wrap(star.depth * STAR_FIELD_SIZE - distance, STAR_FIELD_SIZE) - STAR_FIELD_SIZE / 2,
  };
  const head = toCamera(world, scene.camera);
  // Use the current world cell for both ends. Never draw a trail across a wrap.
  const tail = toCamera({ ...world, z: world.z + trail }, scene.camera);
  const depth = Math.max(0.35, head.z);
  const tailDepth = Math.max(0.35, tail.z);
  const nearFade = Math.max(0, Math.min(1, (head.z - 0.35) / 0.8));
  const edgeFade = Math.max(0, Math.min(1, (12 - Math.abs(world.z)) / 1.8));
  return {
    x: scene.focus.x + head.x / depth / aspect * FOCAL_LENGTH,
    y: scene.focus.y - head.y / depth * FOCAL_LENGTH,
    tailX: scene.focus.x + tail.x / tailDepth / aspect * FOCAL_LENGTH,
    tailY: scene.focus.y - tail.y / tailDepth * FOCAL_LENGTH,
    brightness: nearFade * edgeFade * Math.min(1, 0.3 + 2 / depth),
    scale: Math.min(2.5, 0.45 + 2 / depth),
  };
}
