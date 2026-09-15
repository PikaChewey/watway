import data from "./data/indoor.json";
import { buildingById, places, placeById } from "./data/campus";
import type { Point, Place } from "./types";
export interface IndoorFeature {
  id: string;
  building: string;
  type: string;
  points: number[][];
  nodes: number[];
  levels: number[];
  ref: string;
  name: string;
  room: string;
  access: string;
  wheelchair: string;
  bridge: boolean;
  tunnel: boolean;
  construction: boolean;
  amenity: string;
  source: string;
}
export const indoorFeatures = data as IndoorFeature[];
// The connected Davis Centre footprint includes its eastern CIM wing.
for (const f of indoorFeatures) {
  if (f.type === "room") f.building = "DC";
}
export interface Wall {
  a: [number, number];
  b: [number, number];
  height: number;
  glass?: boolean;
}
export function pointInPolygon(x: number, z: number, poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}
export function segmentDistance(
  x: number,
  z: number,
  a: number[],
  b: number[],
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
export const dcRooms = indoorFeatures.filter(
  (f) => f.type === "room" && f.levels.includes(1),
);
export const dcDoors = indoorFeatures.filter(
  (f) =>
    (f.type === "door" || f.type === "entrance") &&
    f.levels.includes(1) &&
    pointInPolygon(f.points[0][0], f.points[0][1], buildingById.DC.polygon),
);
export const dcWalls: Wall[] = [];
const seenWalls = new Set<string>();
const allDoors = indoorFeatures
  .filter((f) => f.type === "door" || f.type === "entrance")
  .map((f) => f.points[0]);
function addWall(a: number[], b: number[], glass = false) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.15) return;
  let breaks: [number, number][] = [];
  for (const p of allDoors) {
    if (segmentDistance(p[0], p[1], a, b) < 0.45) {
      const t =
        ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) /
        (len * len);
      if (t >= -0.08 && t <= 1.08)
        breaks.push([Math.max(0, t - 0.85 / len), Math.min(1, t + 0.85 / len)]);
    }
  }
  breaks = breaks.sort((a, b) => a[0] - b[0]);
  let prev = 0;
  const draw = (lo: number, hi: number) => {
    if ((hi - lo) * len < 0.15) return;
    const p: [number, number] = [
        a[0] + (b[0] - a[0]) * lo,
        a[1] + (b[1] - a[1]) * lo,
      ],
      q: [number, number] = [
        a[0] + (b[0] - a[0]) * hi,
        a[1] + (b[1] - a[1]) * hi,
      ];
    const key = [
      p.map((n) => n.toFixed(1)).join(","),
      q.map((n) => n.toFixed(1)).join(","),
    ]
      .sort()
      .join("|");
    if (!seenWalls.has(key)) {
      dcWalls.push({ a: p, b: q, height: 3.1, glass });
      seenWalls.add(key);
    }
  };
  for (const [lo, hi] of breaks) {
    draw(prev, lo);
    prev = Math.max(prev, hi);
  }
  draw(prev, 1);
}
for (const r of dcRooms) {
  if (
    ["corridor", "stairs", "elevator"].includes(r.room) ||
    r.name === "atrium"
  )
    continue;
  for (let i = 1; i < r.points.length; i++)
    addWall(
      r.points[i - 1],
      r.points[i],
      r.name.toLowerCase().includes("study"),
    );
}
for (let i = 1; i < buildingById.DC.polygon.length; i++)
  addWall(buildingById.DC.polygon[i - 1], buildingById.DC.polygon[i]);
export const wallCells = new Map<string, Wall[]>();
for (const w of dcWalls) {
  const x1 = Math.floor(Math.min(w.a[0], w.b[0]) / 4),
    x2 = Math.floor(Math.max(w.a[0], w.b[0]) / 4),
    z1 = Math.floor(Math.min(w.a[1], w.b[1]) / 4),
    z2 = Math.floor(Math.max(w.a[1], w.b[1]) / 4);
  for (let x = x1 - 1; x <= x2 + 1; x++)
    for (let z = z1 - 1; z <= z2 + 1; z++) {
      const key = `${x},${z}`,
        list = wallCells.get(key) || [];
      list.push(w);
      wallCells.set(key, list);
    }
}
export function collides(x: number, z: number, radius = 0.24) {
  return (
    wallCells.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`) || []
  ).some((w) => segmentDistance(x, z, w.a, w.b) < radius + 0.1);
}
export function segmentBlocked(a: Point, b: Point, radius = 0.15) {
  const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
  for (let t = 0; t <= 1; t += Math.min(1, 0.3 / (d || 1)))
    if (collides(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, radius))
      return true;
  return collides(b[0], b[2], radius);
}
for (const r of dcRooms) {
  if (
    r.access === "private" ||
    (!r.ref && !r.name) ||
    ["stairs", "elevator", "equipment"].includes(r.room)
  )
    continue;
  const ring = r.points.slice(0, -1);
  const p: Point = [
    ring.reduce((s, p) => s + p[0], 0) / ring.length,
    1,
    ring.reduce((s, p) => s + p[1], 0) / ring.length,
  ];
  const id = r.ref ? `room-DC-${r.ref}` : `osm-poi-${r.id}`;
  const existing = placeById[id];
  const category =
    r.amenity === "toilets"
      ? "washroom"
      : r.name.toLowerCase().includes("study")
        ? "study"
        : "room";
  const place: Place = {
    id,
    name: r.ref
      ? `DC ${r.ref}${r.name ? ` · ${r.name}` : ""}`
      : `DC · ${r.name}`,
    building: "DC",
    floor: 1,
    category,
    point: p,
    tags: [
      r.ref,
      r.name,
      "davis",
      category,
      ...(/quiet|silent/i.test(r.name) ? ["quiet", "silent"] : []),
    ],
    description: `Room geometry and position mapped by OpenStreetMap contributors.${r.access ? " Access: " + r.access + "." : ""} Geometry is mapped, not a current survey.`,
    confidence: "verified",
    source: `https://www.openstreetmap.org/way/${r.id}`,
  };
  if (existing) {
    Object.assign(existing, place);
  } else {
    places.push(place);
    placeById[id] = place;
  }
}
export const indoorCoverage = {
  DC: {
    floors: [1],
    rooms: dcRooms.length,
    source: "OpenStreetMap indoor geometry",
    quality: "Mapped rooms & doors",
  },
  MC: {
    floors: [2, 3, 6],
    rooms: 0,
    source: "Public university floor plans",
    quality: "Source floor plans",
  },
};

const quietMapped = places.find(
  (p) => p.building === "DC" && p.name === "DC · Silent Study",
);
if (quietMapped && placeById["poi-0"])
  placeById["poi-0"].point = [...quietMapped.point];
