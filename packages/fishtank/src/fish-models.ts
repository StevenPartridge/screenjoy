import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh,
  MeshStandardMaterial, Object3D, SphereGeometry, Vector3,
} from "three";

export type FishArchetype = "angel" | "tang" | "clown" | "butterfly" | "mint" | "ruby" | "tetra";
export type FishModel = { group: Group; tail: Group; fins: Object3D[] };
export const FISH_ARCHETYPES: FishArchetype[] = ["angel", "tang", "clown", "butterfly", "mint", "ruby", "tetra"];
export const FISH_CAST: FishArchetype[] = [
  "clown", "tang", "butterfly", "angel", "clown", "mint", "ruby", "tetra", "tetra", "tetra", "ruby",
  "mint", "butterfly", "tetra", "ruby", "clown", "tang", "tetra",
];
export const FISH_PROFILE: Record<FishArchetype, {
  scale: [number, number]; cruiseSpeed: [number, number]; bobAmount: number;
}> = {
  angel: { scale: [0.77, 0.88], cruiseSpeed: [0.32, 0.42], bobAmount: 0.02 },
  tang: { scale: [0.86, 0.98], cruiseSpeed: [0.48, 0.61], bobAmount: 0.025 },
  clown: { scale: [0.74, 0.85], cruiseSpeed: [0.38, 0.5], bobAmount: 0.035 },
  butterfly: { scale: [0.76, 0.86], cruiseSpeed: [0.35, 0.46], bobAmount: 0.02 },
  mint: { scale: [0.64, 0.77], cruiseSpeed: [0.5, 0.64], bobAmount: 0.025 },
  ruby: { scale: [0.48, 0.59], cruiseSpeed: [0.57, 0.72], bobAmount: 0.025 },
  tetra: { scale: [0.37, 0.45], cruiseSpeed: [0.63, 0.78], bobAmount: 0.02 },
};

const PALETTES: Record<FishArchetype, { body: number; fin: number; height: number; depth: number }> = {
  clown: { body: 0xff781e, fin: 0xff991f, height: 0.43, depth: 0.27 },
  tang: { body: 0x1661f4, fin: 0xffd525, height: 0.52, depth: 0.22 },
  butterfly: { body: 0xffd12d, fin: 0xffbc24, height: 0.58, depth: 0.21 },
  angel: { body: 0xf7dab0, fin: 0xffbf4c, height: 0.61, depth: 0.20 },
  mint: { body: 0x36d5b2, fin: 0xffbd38, height: 0.39, depth: 0.24 },
  ruby: { body: 0xf4598a, fin: 0xd83976, height: 0.33, depth: 0.21 },
  tetra: { body: 0x21bce4, fin: 0x72c9e1, height: 0.25, depth: 0.17 },
};

function surface(color: number, name: string, fin = false) {
  const mat = new MeshStandardMaterial({
    color, roughness: fin ? 0.48 : 0.32, metalness: fin ? 0.02 : 0.12,
    ...(fin ? { side: DoubleSide } : {}),
  });
  mat.name = name;
  return mat;
}

/** Markings follow the body surface, so they stay attached at every viewing angle. */
function bodyGeometry(archetype: FishArchetype) {
  const palette = PALETTES[archetype];
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rings = 64, sides = 32;
  const base = new Color(palette.body), ink = new Color(0x101c32), ivory = new Color(0xfff5dd);
  const c = new Color();
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const x = -0.83 + u * 1.65;
    // Narrow peduncle, full shoulders, rounded forehead and a small snout.
    const radius = Math.pow(Math.sin(Math.PI * u), 0.68) * (0.66 + 0.42 * u);
    for (let j = 0; j <= sides; j++) {
      const theta = j / sides * Math.PI * 2;
      const y = Math.cos(theta) * palette.height * radius;
      const z = Math.sin(theta) * palette.depth * radius;
      positions.push(x, y, z);
      c.copy(base);
      if (archetype === "clown") {
        const stripe = Math.min(Math.abs(x - 0.40 + y * 0.12), Math.abs(x + 0.18 + y * 0.25), Math.abs(x + 0.68));
        if (stripe < 0.105) c.copy(ink);
        if (stripe < 0.070) c.copy(ivory);
      } else if (archetype === "tang") {
        const oval = ((x + 0.12) / 0.63) ** 2 + ((y - 0.05) / 0.24) ** 2;
        if ((oval > 0.58 && oval < 1.2) || (x < -0.38 && Math.abs(y) < 0.10)) c.copy(ink);
      } else if (archetype === "butterfly") {
        if (x > 0.31 && x < 0.47) c.copy(ink);
        if (x > 0.5) c.copy(ivory);
        if (((x + 0.43) / 0.105) ** 2 + ((y - 0.21) / 0.12) ** 2 < 1) c.copy(ink);
        if (x < 0.2 && Math.sin(x * 54 + y * 18) > 0.88) c.multiplyScalar(0.86);
      } else if (archetype === "angel") {
        if (Math.sin(x * 15 + y * 1.5) > 0.58) c.copy(ink);
      } else if (archetype === "tetra") {
        if (y < -0.025 && x < 0.1) c.setHex(0xff4a54);
        if (Math.abs(y - 0.04) < 0.052) c.setHex(0x9afcff);
      } else if (archetype === "mint") {
        if (Math.sin(x * 28 + y * 5) > 0.7) c.lerp(new Color(0x087d96), 0.6);
      } else if (y > 0.07) c.lerp(new Color(0xffad71), 0.48);
      // A warm belly and darker back give the small silhouettes a readable volume.
      c.multiplyScalar(0.84 + 0.16 * Math.sin(theta) ** 2);
      if (y < -0.06) c.lerp(ivory, Math.min(0.27, -y * 0.6));
      colors.push(c.r, c.g, c.b);
      if (i < rings && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let j = 0; j <= sides; j++) {
    normals.setXYZ(j, -1, 0, 0);
    normals.setXYZ(rings * (sides + 1) + j, 1, 0, 0);
  }
  geometry.name = "SculptedBody";
  return geometry;
}

/** A curved fin membrane, with colored rays and a scalloped trailing edge. */
function membrane(points: [number, number, number][], color: number, name: string) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const root = new Vector3(...points[0]);
  const edge = points.slice(1).map(p => new Vector3(...p));
  const base = new Color(color), c = new Color();
  const rays = 32, rows = 7;
  for (let i = 0; i <= rays; i++) {
    const t = i / rays * (edge.length - 1), segment = Math.min(edge.length - 2, Math.floor(t));
    const tip = edge[segment].clone().lerp(edge[segment + 1], t - segment);
    for (let j = 0; j <= rows; j++) {
      const r = j / rows;
      const p = root.clone().lerp(tip, r);
      p.z += Math.sin(r * Math.PI) * 0.045 + Math.sin(i * 2.8) * 0.009 * r;
      positions.push(p.x, p.y, p.z);
      c.copy(base).multiplyScalar(i % 3 === 0 ? 0.73 : 1);
      if (j === rows) c.lerp(new Color(0x182337), 0.65);
      else if (j > 4) c.lerp(new Color(0xffecba), 0.23);
      colors.push(c.r, c.g, c.b);
      if (i < rays && j < rows) {
        const a = i * (rows + 1) + j, b = a + rows + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const normals = geo.getAttribute("normal");
  for (let i = 0; i < normals.count; i++) {
    if (Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) < 0.1) normals.setXYZ(i, 0, 0, 1);
  }
  const mat = surface(0xffffff, name, true);
  mat.vertexColors = true;
  const mesh = new Mesh(geo, mat);
  mesh.name = name + "Membrane";
  return mesh;
}

export function createFishModel(archetype: FishArchetype): FishModel {
  const group = new Group(), palette = PALETTES[archetype];
  group.name = `Fish_${archetype}`;
  group.userData = { archetype, modelVersion: 2, forwardAxis: "+X", upAxis: "+Y", animatedParts: ["Tail", "FinDorsal", "FinVentral", "FinPectoralL", "FinPectoralR"] };
  const bodyMat = surface(0xffffff, `${archetype}Scales`);
  bodyMat.vertexColors = true;
  const body = new Mesh(bodyGeometry(archetype), bodyMat);
  body.name = "Body";
  group.add(body);

  const tail = new Group();
  tail.name = "Tail";
  tail.position.x = -0.76;
  const fork = archetype === "tang" || archetype === "tetra" || archetype === "mint";
  tail.add(membrane([[0, 0, 0], [-0.53, 0.38, 0], [fork ? -0.36 : -0.60, 0.12, 0], [fork ? -0.29 : -0.63, 0, 0], [fork ? -0.36 : -0.60, -0.12, 0], [-0.53, -0.38, 0]], palette.fin, "Tail"));
  group.add(tail);
  const fins: Object3D[] = [];
  const tall = archetype === "angel";
  for (const side of [1, -1]) {
    const fin = new Group();
    fin.name = side > 0 ? "FinDorsal" : "FinVentral";
    const h = palette.height * side;
    fin.add(membrane([[0.25, h * 0.65, 0], [0.20, h * 1.04, 0], [-0.20, h * (tall ? 2.1 : 1.45), 0], [-0.60, h * (tall ? 1.45 : 0.95), 0], [-0.73, h * 0.24, 0]], archetype === "tang" ? palette.body : palette.fin, fin.name));
    group.add(fin);
    fins.push(fin);
  }
  for (const side of [-1, 1]) {
    const fin = new Group();
    fin.name = side > 0 ? "FinPectoralL" : "FinPectoralR";
    fin.position.set(0.25, -0.06, side * palette.depth * 0.87);
    fin.add(membrane([[0, 0, 0], [-0.20, 0.02, side * 0.27], [-0.43, -0.17, side * 0.30], [-0.26, -0.25, side * 0.14], [-0.04, -0.12, 0]], palette.fin, fin.name));
    group.add(fin);
    fins.push(fin);
  }
  const eyeWhite = surface(0xfde9b1, "EyeIris");
  const pupil = surface(0x080e1a, "EyePupil");
  const glint = surface(0xffffff, "EyeGlint");
  glint.emissive.setHex(0xffffff); glint.emissiveIntensity = 0.4;
  for (const side of [-1, 1]) {
    const eye = new Group();
    eye.name = side > 0 ? "EyeL" : "EyeR";
    eye.position.set(0.53, palette.height * 0.25, side * palette.depth * 0.73);
    const sphere = new SphereGeometry(1, 16, 12);
    const iris = new Mesh(sphere, eyeWhite);
    iris.scale.set(0.103, 0.108, 0.043);
    const black = new Mesh(sphere, pupil);
    black.scale.set(0.074, 0.083, 0.034);
    black.position.set(0.012, 0, side * 0.03);
    const highlight = new Mesh(sphere, glint);
    highlight.scale.setScalar(0.024);
    highlight.position.set(0.029, 0.034, side * 0.059);
    eye.add(iris, black, highlight);
    group.add(eye);
  }
  const mouth = new Mesh(new SphereGeometry(1, 12, 8), surface(0x633c36, "Mouth"));
  mouth.name = "Mouth";
  mouth.position.set(0.798, -0.028, 0);
  mouth.scale.set(0.023, 0.032, 0.048);
  group.add(mouth);
  return { group, tail, fins };
}
