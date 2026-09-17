import { createRandom } from "@screenjoy/runtime";
import { FOCAL_LENGTH, fromCamera, toCamera, type Scene, type Vec3 } from "./scene.js";

type Face = { vertices: Vec3[]; color: string; light?: boolean; rock?: boolean };
export type ExteriorModel = Face[];
const point = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Small ship meshes share the flight axis, so oblique seats reveal different silhouettes. */
export function buildExterior(scene: Scene): ExteriorModel {
  const faces: Face[] = [];
  const { kind, hue, detailSeed } = scene.exterior;
  const random = createRandom(detailSeed);
  const metal = "#526479", dark = "#202c40", pale = "#94a0ab";
  const light = `hsl(${hue}, 80%, 68%)`;
  const face = (vertices: Vec3[], color: string, luminous = false, rock = false) => {
    faces.push({ vertices, color, light: luminous, rock });
  };
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, luminous = false) => {
    const v = [point(x-sx,y-sy,z-sz),point(x+sx,y-sy,z-sz),point(x+sx,y+sy,z-sz),point(x-sx,y+sy,z-sz),
      point(x-sx,y-sy,z+sz),point(x+sx,y-sy,z+sz),point(x+sx,y+sy,z+sz),point(x-sx,y+sy,z+sz)];
    for (const indices of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]) {
      face(indices.map(i => v[i]), color, luminous);
    }
  };
  const tube = (x: number, y: number, rings: Array<[number, number]>, color: string) => {
    const count = 10;
    const vertices = rings.map(([z, radius]) => Array.from({ length: count }, (_, i) => {
      const angle = i / count * Math.PI * 2;
      return point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z);
    }));
    for (let ring = 1; ring < vertices.length; ring++) for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      face([vertices[ring-1][i], vertices[ring-1][next], vertices[ring][next], vertices[ring][i]], color);
    }
    face(vertices[0].slice().reverse(), dark);
    face(vertices[vertices.length - 1], color);
  };
  const engine = (x: number, y: number, size: number, length: number) => {
    tube(x, y, [[-length, size * 0.7], [-length * 0.85, size], [length * 0.7, size], [length, size * 0.25]], metal);
    // Emissive ribs on both sides remain visible from either side of the ship.
    for (const side of [-1, 1]) {
      box(x + side * size * 0.97, y, -length * 0.04, 0.015, size * 0.16, length * 0.72, light, true);
      for (let i = 0; i < 5; i++) box(x + side * size, y - size * 0.25, -length * 0.65 + i * length * 0.3, 0.02, size * 0.12, 0.035, dark);
    }
    box(x, y, -length - 0.008, size * 0.36, size * 0.36, 0.015, light, true);
  };
  if (kind === "nacelle") {
    engine(0, 0, 0.43, 2.9);
    // A pylon disappearing under the sill shows that this engine belongs to us.
    box(0, -1.05, 0.35, 0.12, 0.8, 0.48, dark);
    box(0, -0.42, 0.35, 0.23, 0.13, 0.7, pale);
    box(0, 0.38, 0.55, 0.13, 0.075, 1.2, pale);
  } else if (kind === "hull") {
    // Long terraced decks, with warm passenger windows along both flanks.
    for (let deck = 0; deck < 3; deck++) {
      const width = 1.7 - deck * 0.4;
      box(0, -0.5 + deck * 0.24, 0, width, 0.12, 3.3 - deck * 0.3, deck === 2 ? pale : metal);
      for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
        if (random() < 0.18) continue;
        box(side * (width + 0.005), -0.5 + deck * 0.24, -2.6 + i * 0.45, 0.012, 0.035, 0.08, "#edc994", true);
      }
    }
    box(0.5, 0.46, -1.3, 0.025, 0.45, 0.025, pale);
    box(0.5, 0.83, -1.3, 0.23, 0.025, 0.035, metal);
    box(-0.6, 0.25, 1.8, 0.2, 0.06, 0.4, dark);
  } else if (kind === "convoy") {
    tube(0, 0, [[-1.85, 0.27], [-1.25, 0.46], [0.7, 0.38], [1.8, 0.035]], pale);
    box(0, -0.06, -0.65, 1.1, 0.045, 0.33, dark);
    engine(-1.05, -0.06, 0.18, 1.25);
    engine(1.05, -0.06, 0.18, 1.25);
    box(0, 0.35, 0.45, 0.2, 0.1, 0.4, metal);
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
      box(side * 0.405, 0.1, -1.05 + i * 0.23, 0.018, 0.026, 0.045, "#ffe0aa", true);
    }
    box(0, 0.43, 0.58, 0.16, 0.025, 0.12, light, true);
  } else if (kind === "tow") {
    const rings = 7, segments = 11;
    const vertices = Array.from({ length: rings + 1 }, (_, row) => {
      const latitude = row / rings * Math.PI;
      return Array.from({ length: segments }, (_, col) => {
        const longitude = col / segments * Math.PI * 2;
        const radius = 0.8 + random() * 0.25;
        return point(Math.sin(latitude) * Math.cos(longitude) * radius,
          Math.cos(latitude) * radius * 0.83, Math.sin(latitude) * Math.sin(longitude) * radius * 1.2);
      });
    });
    for (let row = 1; row <= rings; row++) for (let col = 0; col < segments; col++) {
      const next = (col + 1) % segments;
      const color = `hsl(${25 + random() * 15}, ${8 + random() * 10}%, ${28 + random() * 18}%)`;
      face([vertices[row-1][col], vertices[row-1][next], vertices[row][col]], color, false, true);
      face([vertices[row-1][next], vertices[row][next], vertices[row][col]], color, false, true);
    }
    // Two little tugs explain why this rock can keep pace even in FTL.
    for (const side of [-1, 1]) {
      tube(side * 1.3, -0.05, [[0.8, 0.08], [1, 0.18], [1.65, 0.12]], metal);
      box(side * 1.3, -0.05, 0.8, 0.08, 0.08, 0.02, light, true);
    }
  }
  return faces;
}

/** Fixed hulls stay locked to the cabin; companion motion is bounded and very slow. */
export function exteriorPose(scene: Scene, elapsed: number) {
  const { kind, side, phase, scale } = scene.exterior;
  const attached = kind === "nacelle" || kind === "hull";
  return {
    x: attached ? 0.5 + side * (kind === "hull" ? 0.17 : 0.29) : 0.5 + side * 0.12 + Math.sin(elapsed * 0.025 + phase) * 0.045,
    y: attached ? (kind === "hull" ? 0.76 : 0.7) : 0.43 + Math.sin(elapsed * 0.018 + phase) * 0.025,
    depth: attached ? 5.8 : 10.5,
    scale,
    rockAngle: kind === "tow" ? elapsed * 0.035 + phase : 0,
  };
}

export function drawExterior(ctx: CanvasRenderingContext2D, scene: Scene, model: ExteriorModel,
  width: number, height: number, elapsed: number, warp: number) {
  if (scene.exterior.kind === "clear") return;
  const pose = exteriorPose(scene, elapsed);
  const aspect = width / height;
  const anchor = fromCamera({
    x: (pose.x - scene.focus.x) * pose.depth * aspect / FOCAL_LENGTH,
    y: -(pose.y - scene.focus.y) * pose.depth / FOCAL_LENGTH,
    z: pose.depth,
  }, scene.camera);
  const project = (vertex: Vec3, rock = false) => {
    const angle = rock ? pose.rockAngle : 0;
    const x = vertex.x * Math.cos(angle) + vertex.z * Math.sin(angle);
    const z = -vertex.x * Math.sin(angle) + vertex.z * Math.cos(angle);
    const camera = toCamera({ x: anchor.x + x * pose.scale,
      y: anchor.y + vertex.y * pose.scale, z: anchor.z + z * pose.scale }, scene.camera);
    return { x: (scene.focus.x + camera.x / camera.z / aspect * FOCAL_LENGTH) * width,
      y: (scene.focus.y - camera.y / camera.z * FOCAL_LENGTH) * height, z: camera.z };
  };
  const projected = model.map(face => {
    const vertices = face.vertices.map(v => project(v, face.rock));
    return { face, vertices, depth: vertices.reduce((sum, v) => sum + v.z, 0) / vertices.length };
  }).sort((a, b) => b.depth - a.depth);
  ctx.save(); ctx.lineJoin = "round";
  for (const { face, vertices } of projected) {
    if (vertices.some(v => v.z < 0.3)) continue;
    ctx.beginPath(); ctx.moveTo(vertices[0].x, vertices[0].y);
    for (const vertex of vertices.slice(1)) ctx.lineTo(vertex.x, vertex.y);
    ctx.closePath();
    ctx.fillStyle = face.color; ctx.fill();
    if (!face.light) {
      const [a, b, c] = face.vertices;
      const ux = b.x-a.x, uy = b.y-a.y, uz = b.z-a.z;
      const vx = c.x-a.x, vy = c.y-a.y, vz = c.z-a.z;
      const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      const lighting = Math.abs((nx * 0.35 + ny * 0.8 + nz * 0.3) / length);
      ctx.fillStyle = `rgba(2, 7, 19, ${0.28 + (1 - lighting) * 0.46})`; ctx.fill();
      ctx.strokeStyle = "#080e1928"; ctx.lineWidth = 0.45; ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(225, 241, 255, ${0.08 + warp * 0.26})`; ctx.fill();
    }
  }
  // Tethers sit ahead of the cargo without crossing its opaque silhouette.
  if (scene.exterior.kind === "tow") {
    for (const side of [-1, 1]) {
      const a = project(point(side * 0.75, -0.05, 0.6));
      const b = project(point(side * 1.3, -0.05, 1.25));
      ctx.strokeStyle = `hsla(${scene.exterior.hue}, 70%, 70%, ${0.14 + warp * 0.12})`;
      ctx.lineWidth = Math.max(0.5, height / 900); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.restore();
}
