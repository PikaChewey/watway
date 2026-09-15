import raw from "../data/watisgrass.json";
import { buildingById, project, places, placeById } from "../data/campus";
import {
  indoorFeatures,
  pointInPolygon,
  collides,
  segmentBlocked,
} from "../indoor";
import type { Point, GraphNode, GraphEdge } from "../types";
export type PhysicalKind =
  | "corridor"
  | "stairs"
  | "landing"
  | "bridge"
  | "tunnel"
  | "entrance"
  | "door"
  | "elevator";
export interface PhysicalSegment {
  id: string;
  a: Point;
  b: Point;
  width: number;
  kind: PhysicalKind;
  building: string;
  toBuilding?: string;
  floor: number;
  toFloor?: number;
  estimated: boolean;
  steps?: number;
  label: string;
}
export interface PhysicalDoor {
  id: string;
  label: string;
  building: string;
  floor: number;
  point: Point;
  direction: Point;
  estimated: boolean;
  source: string;
}
export interface PhysicalEntrance {
  id: string;
  building: string;
  floor: number;
  point: Point;
  outside: Point;
  estimated: boolean;
}
export const coveredBuildings = new Set([
  "MC",
  "SLC",
  "STC",
  "QNC",
  "B1",
  "B2",
  "C2",
  "ESC",
  "EIT",
  "PHY",
  "DC",
  "E2",
  "E3",
  "E5",
  "E6",
  "PSE",
  "RCH",
  "DWE",
  "CPH",
  "AL",
  "ML",
  "EV1",
  "EV2",
  "EV3",
  "HH",
  "TC",
  "SCH",
  "NH",
  "PAC",
]);
export const segments: PhysicalSegment[] = [];
export const doors: PhysicalDoor[] = [];
export const entrances: PhysicalEntrance[] = [];
const code = (s: string) => (s === "DP" ? "LIB" : s === "E7" ? "PSE" : s);
export const floorNumber = (s: string | number) =>
  s === "B" ? 0 : Number(s) || 1;
export const floorY = (f: number) => (f - 1) * 3.8 + 0.5;
const len = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function add(s: Omit<PhysicalSegment, "id">, id?: string) {
  if (len(s.a, s.b) < 0.015) return;
  segments.push({ ...s, id: id || `physical-${segments.length}` });
}
function line(
  points: Point[],
  kind: PhysicalKind,
  building: string,
  floor: number,
  estimated: boolean,
  label: string,
  width = 3.1,
  toBuilding?: string,
  toFloor?: number,
) {
  for (let i = 1; i < points.length; i++)
    add({
      a: points[i - 1],
      b: points[i],
      width,
      kind,
      building,
      toBuilding,
      floor,
      toFloor,
      estimated,
      label,
    });
}
const rawFeatures = raw.features as any[];
for (const f of rawFeatures) {
  const p = f.properties;
  if (
    !p.start ||
    f.geometry.type !== "LineString" ||
    !["hallway", "open", "bridge", "tunnel"].includes(p.type)
  )
    continue;
  const a = code(p.start.buildingCode),
    b = code(p.end.buildingCode);
  if (!coveredBuildings.has(a) || !coveredBuildings.has(b)) continue;
  if ([a, b].includes("MC") && ([a, b].includes("DC") || [a, b].includes("M3")))
    continue;
  const fa = floorNumber(p.start.floor),
    fb = floorNumber(p.end.floor);
  const pts = f.geometry.coordinates.map((c: number[], i: number) => {
    const q = project(c[1], c[0]);
    q[1] =
      floorY(fa) +
      ((floorY(fb) - floorY(fa)) * i) /
        Math.max(1, f.geometry.coordinates.length - 1);
    return q;
  });
  const kind =
    p.type === "bridge"
      ? "bridge"
      : p.type === "tunnel"
        ? "tunnel"
        : "corridor";
  line(
    pts,
    kind,
    a,
    fa,
    false,
    kind === "corridor" ? `${a} · floor ${fa} hallway` : `${a}–${b} ${kind}`,
    kind === "bridge" ? 3.5 : 3.1,
    b,
    fb,
  );
}
// MC's mapped third-floor circulation establishes its rectangular circulation grid.
// Carrying this grid to other floors is explicit reconstruction, not a surveyed floor plan.
const mcTemplates = segments.filter(
  (s) => s.building === "MC" && s.floor === 3 && s.kind === "corridor",
);
for (const f of [1, 2, 4, 5, 6])
  for (const s of mcTemplates)
    line(
      [
        [s.a[0], floorY(f), s.a[2]],
        [s.b[0], floorY(f), s.b[2]],
      ],
      "corridor",
      "MC",
      f,
      true,
      `MC · floor ${f} reconstructed corridor`,
    );
// Retain the mapped fourth-floor circulation line as the stronger reference where available.
for (const f of indoorFeatures.filter(
  (f) =>
    f.building === "MC" &&
    f.type === "corridor" &&
    f.levels.includes(4) &&
    f.points.length > 1,
))
  line(
    f.points.map((p) => [p[0], floorY(4), p[1]]),
    "corridor",
    "MC",
    4,
    false,
    "MC · mapped floor 4 corridor",
  );
// STC basement is modelled independently; no unverified basement tunnel is invented.
const stcTemplates = segments.filter(
  (s) => s.building === "STC" && s.floor === 1 && s.kind === "corridor",
);
for (const f of [0, 2])
  for (const s of stcTemplates)
    line(
      [
        [s.a[0], floorY(f), s.a[2]],
        [s.b[0], floorY(f), s.b[2]],
      ],
      "corridor",
      "STC",
      f,
      true,
      `STC · floor ${f === 0 ? "B" : f} reconstructed corridor`,
    );
export const stairShafts: {
  id: string;
  building: string;
  center: Point;
  floors: number[];
  landings: Map<number, Point>;
}[] = [];
for (const f of rawFeatures) {
  if (f.properties.type !== "stairs" || f.geometry.type !== "Point") continue;
  const connections = f.properties.connections
    .filter((c: any) => coveredBuildings.has(code(c.buildingCode)))
    .sort((a: any, b: any) => a.level - b.level);
  if (connections.length < 2) continue;
  const building = code(connections[0].buildingCode),
    center = project(f.geometry.coordinates[1], f.geometry.coordinates[0]);
  const floors = [
    ...new Set(connections.map((c: any) => floorNumber(c.floor))),
  ] as number[];
  if (building === "STC" && !floors.includes(0)) floors.unshift(0);
  const bc = buildingById[building].center;
  let fx = bc[0] - center[0],
    fz = bc[2] - center[2];
  const norm = Math.hypot(fx, fz) || 1;
  fx /= norm;
  fz /= norm;
  const px = -fz,
    pz = fx;
  const pt = (u: number, v: number, y: number): Point => [
    center[0] + px * u + fx * v,
    y,
    center[2] + pz * u + fz * v,
  ];
  const landings = new Map<number, Point>();
  for (const floor of floors) landings.set(floor, pt(0, 0, floorY(floor)));
  for (let i = 1; i < floors.length; i++) {
    const fa = floors[i - 1],
      fb = floors[i];
    if (fb - fa !== 1) continue;
    const y = floorY(fa),
      low = pt(-0.95, 0, y),
      mid1 = pt(-0.95, 5.4, y + 1.9),
      mid2 = pt(0.95, 5.4, y + 1.9),
      high = pt(0.95, 0, y + 3.8);
    line(
      [pt(0, 0, y), low],
      "landing",
      building,
      fa,
      true,
      `${building} stair landing`,
      2.2,
    );
    add({
      a: low,
      b: mid1,
      width: 1.8,
      kind: "stairs",
      building,
      floor: fa,
      toFloor: fb,
      estimated: true,
      steps: 12,
      label: `${building} stairs · ${fa === 0 ? "B" : fa} → ${fb}`,
    });
    line(
      [mid1, mid2],
      "landing",
      building,
      fa,
      true,
      `${building} half landing`,
      2,
    );
    add({
      a: mid2,
      b: high,
      width: 1.8,
      kind: "stairs",
      building,
      floor: fa,
      toFloor: fb,
      estimated: true,
      steps: 12,
      label: `${building} stairs · ${fa === 0 ? "B" : fa} → ${fb}`,
    });
    line(
      [high, pt(0, 0, y + 3.8)],
      "landing",
      building,
      fb,
      true,
      `${building} floor ${fb} landing`,
      2.2,
    );
  }
  stairShafts.push({ id: f.id, building, center, floors, landings });
}
function nearestOnSegment(p: Point, s: PhysicalSegment) {
  const dx = s.b[0] - s.a[0],
    dz = s.b[2] - s.a[2],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - s.a[0]) * dx + (p[2] - s.a[2]) * dz) /
          (dx * dx + dz * dz || 1),
      ),
    );
  return [
    s.a[0] + dx * t,
    s.a[1] + (s.b[1] - s.a[1]) * t,
    s.a[2] + dz * t,
  ] as Point;
}
function nearestCorridor(p: Point, building: string, floor: number) {
  let best:
    { point: Point; distance: number; segment: PhysicalSegment } | undefined;
  for (const s of segments) {
    if (s.kind !== "corridor" || s.building !== building || s.floor !== floor)
      continue;
    const point = nearestOnSegment(p, s),
      distance = len(p, point);
    if (!best || distance < best.distance)
      best = { point, distance, segment: s };
  }
  return best;
}
for (const shaft of stairShafts)
  for (const [f, p] of shaft.landings) {
    const nearest = nearestCorridor(p, shaft.building, f);
    if (nearest && nearest.distance < 32)
      line(
        [p, nearest.point],
        "corridor",
        shaft.building,
        f,
        true,
        `${shaft.building} · corridor to stairwell`,
        2.6,
      );
  }
for (const f of rawFeatures) {
  if (f.properties.type !== "door" || f.geometry.type !== "Point") continue;
  const p = f.properties,
    a = code(p.start.buildingCode),
    b = code(p.end.buildingCode);
  const building = a === "OUT" ? b : a;
  if (!coveredBuildings.has(building) || !(a === "OUT" || b === "OUT"))
    continue;
  const floor = floorNumber(a === "OUT" ? p.end.floor : p.start.floor),
    point = project(f.geometry.coordinates[1], f.geometry.coordinates[0]);
  point[1] = floorY(floor);
  const near = nearestCorridor(point, building, floor);
  if (!near || near.distance > 30) continue;
  line(
    [point, near.point],
    "entrance",
    building,
    floor,
    near.distance > 1,
    `${building} · entrance vestibule`,
    2.8,
  );
  const bc = buildingById[building].center,
    dx = point[0] - bc[0],
    dz = point[2] - bc[2],
    d = Math.hypot(dx, dz) || 1;
  const outside: Point = [
    point[0] + (dx / d) * 4,
    point[1],
    point[2] + (dz / d) * 4,
  ];
  line(
    [outside, point],
    "entrance",
    building,
    floor,
    true,
    `Enter ${building} · floor ${floor}`,
    2.8,
  );
  entrances.push({
    id: `entrance-${building}-${f.id}`,
    building,
    floor,
    point,
    outside,
    estimated: false,
  });
}
// Room-door anchors: identifier/floor verified separately from the inferred precise door position.
const doorSeeds = [
  {
    id: "room-MC-4020",
    building: "MC",
    floor: 4,
    anchor: [-24, 0, -40] as Point,
    label: "MC 4020",
  },
  {
    id: "room-MC-2065",
    building: "MC",
    floor: 2,
    anchor: [-27, 0, -20] as Point,
    label: "MC 2065",
  },
  {
    id: "room-STC-0010",
    building: "STC",
    floor: 0,
    anchor: buildingById.STC.center,
    label: "STC 0010",
  },
  {
    id: "room-STC-0020",
    building: "STC",
    floor: 0,
    anchor: [
      buildingById.STC.center[0] + 8,
      0,
      buildingById.STC.center[2],
    ] as Point,
    label: "STC 0020",
  },
];
for (const seed of doorSeeds) {
  const p: Point = [seed.anchor[0], floorY(seed.floor), seed.anchor[2]],
    nearest = nearestCorridor(p, seed.building, seed.floor);
  if (!nearest) continue;
  const s = nearest.segment,
    dx = s.b[0] - s.a[0],
    dz = s.b[2] - s.a[2],
    d = Math.hypot(dx, dz) || 1;
  const direction: Point = [-dz / d, 0, dx / d];
  const point: Point = [
    nearest.point[0] + direction[0] * 2.4,
    p[1],
    nearest.point[2] + direction[2] * 2.4,
  ];
  const stand: Point = [
    point[0] - direction[0] * 0.7,
    point[1],
    point[2] - direction[2] * 0.7,
  ];
  line(
    [nearest.point, stand],
    "door",
    seed.building,
    seed.floor,
    true,
    `Arrive at ${seed.label} door`,
    2,
  );
  doors.push({
    ...seed,
    point,
    direction,
    estimated: true,
    source:
      "University room identifier; precise door anchor inferred from circulation model",
  });
  const existing = placeById[seed.id];
  if (existing) {
    existing.point = stand;
    existing.floor = seed.floor;
    existing.description =
      "Physically connected door in the rehearsal model. Room number and floor are known; exact doorway placement needs floor-plan verification.";
  } else {
    const place = {
      id: seed.id,
      name: seed.label,
      building: seed.building,
      floor: seed.floor,
      category: "room" as const,
      point: stand,
      tags: ["room", "class", seed.label],
      confidence: "approximate" as const,
      description: "Physically connected door; precise placement is inferred.",
    };
    places.push(place);
    placeById[place.id] = place;
  }
}
// Spatial hash shared by collision checks, graph validation, and rendering of open junctions.
const spatial = new Map<string, PhysicalSegment[]>();
for (const s of segments) {
  const x1 = Math.floor((Math.min(s.a[0], s.b[0]) - s.width) / 5),
    x2 = Math.floor((Math.max(s.a[0], s.b[0]) + s.width) / 5),
    z1 = Math.floor((Math.min(s.a[2], s.b[2]) - s.width) / 5),
    z2 = Math.floor((Math.max(s.a[2], s.b[2]) + s.width) / 5);
  for (let x = x1; x <= x2; x++)
    for (let z = z1; z <= z2; z++) {
      const key = `${x}:${z}`,
        list = spatial.get(key) || [];
      list.push(s);
      spatial.set(key, list);
    }
}
export function surfacesAt(x: number, z: number) {
  return spatial.get(`${Math.floor(x / 5)}:${Math.floor(z / 5)}`) || [];
}
export function samplePhysical(
  x: number,
  z: number,
  y: number,
  radius = 0.2,
  exclude?: string,
  preferStairs = true,
) {
  let best:
    { height: number; segment: PhysicalSegment; distance: number } | undefined;
  for (const s of surfacesAt(x, z)) {
    if (s.id === exclude) continue;
    const p: Point = [x, y, z],
      q = nearestOnSegment(p, s);
    if (s.kind === "stairs" && s.steps) {
      const length = Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2]);
      const t = length ? Math.hypot(q[0] - s.a[0], q[2] - s.a[2]) / length : 0;
      q[1] =
        s.a[1] + ((s.b[1] - s.a[1]) * Math.ceil(t * s.steps - 1e-6)) / s.steps;
    }
    const d = Math.hypot(x - q[0], z - q[2]);
    if (d > s.width / 2 - radius + 0.06 || Math.abs(q[1] - y) > 0.38) continue;
    if (
      !best ||
      (preferStairs && s.kind === "stairs" && best.segment.kind !== "stairs") ||
      ((!preferStairs || s.kind === best.segment.kind) &&
        Math.abs(q[1] - y) + d * 0.01 <
          Math.abs(best.height - y) + best.distance * 0.01)
    )
      best = { height: q[1], segment: s, distance: d };
  }
  return best;
}
export function segmentWalkable(a: Point, b: Point, radius = 0.16) {
  const d = len(a, b),
    n = Math.max(1, Math.ceil(d / 0.16));
  let y = a[1];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      x = a[0] + (b[0] - a[0]) * t,
      z = a[2] + (b[2] - a[2]) * t,
      expected = a[1] + (b[1] - a[1]) * t;
    const sample = samplePhysical(x, z, expected, radius);
    if (!sample) return false;
    y = sample.height;
  }
  return Math.abs(y - b[1]) < 0.25;
}
export const physicalNodes = new Map<string, GraphNode>(),
  physicalEdges: GraphEdge[] = [];
const key = (p: Point) =>
  `${Math.round(p[0] * 20)}:${Math.round(p[1] * 20)}:${Math.round(p[2] * 20)}`;
function graphNode(p: Point, s: PhysicalSegment) {
  const id = `phys:${key(p)}`;
  if (!physicalNodes.has(id))
    physicalNodes.set(id, {
      id,
      point: p,
      kind:
        s.kind === "stairs"
          ? "stairs"
          : s.kind === "entrance"
            ? "entrance"
            : "hallway",
      building: s.building,
      floor: Math.round((p[1] - 0.5) / 3.8) + 1,
      label: s.label,
    });
  return id;
}
function graphEdge(a: string, b: string, s: PhysicalSegment) {
  if (a === b) return;
  physicalEdges.push({
    id: `${a}|${b}`,
    from: a,
    to: b,
    distance: Math.max(
      0.01,
      len(physicalNodes.get(a)!.point, physicalNodes.get(b)!.point),
    ),
    kind:
      s.kind === "corridor" || s.kind === "landing" || s.kind === "door"
        ? "indoor"
        : s.kind,
    accessible: s.kind !== "stairs",
    estimated: s.estimated,
    name: s.label,
    physical: true,
    surfaceId: s.id,
  });
}
const graphBuckets = new Map<string, string[]>();
for (const s of segments) {
  const distance = len(s.a, s.b),
    n = Math.max(1, Math.ceil(distance / 0.45));
  let prev: string | undefined;
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      p: Point = [
        s.a[0] + (s.b[0] - s.a[0]) * t,
        s.a[1] + (s.b[1] - s.a[1]) * t,
        s.a[2] + (s.b[2] - s.a[2]) * t,
      ];
    if (s.kind === "stairs" && s.steps)
      p[1] =
        s.a[1] + ((s.b[1] - s.a[1]) * Math.ceil(t * s.steps - 1e-6)) / s.steps;
    const id = graphNode(p, s);
    if (prev) graphEdge(prev, id, s);
    prev = id;
    const k = `${Math.floor(p[0])}:${Math.floor(p[1])}:${Math.floor(p[2])}`,
      bucket = graphBuckets.get(k) || [];
    if (!bucket.includes(id)) bucket.push(id);
    graphBuckets.set(k, bucket);
  }
}
const joinPairs = new Set<string>();
for (const n of physicalNodes.values()) {
  const p = n.point,
    c = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++)
        for (const id of graphBuckets.get(
          `${c[0] + x}:${c[1] + y}:${c[2] + z}`,
        ) || []) {
          if (id <= n.id) continue;
          const m = physicalNodes.get(id)!;
          if (len(p, m.point) > 0.72 || Math.abs(p[1] - m.point[1]) > 0.22)
            continue;
          const pair = n.id + "|" + id;
          if (joinPairs.has(pair) || !segmentWalkable(p, m.point)) continue;
          joinPairs.add(pair);
          physicalEdges.push({
            id: pair,
            from: n.id,
            to: id,
            distance: len(p, m.point),
            kind:
              n.kind === "stairs" || m.kind === "stairs" ? "stairs" : "indoor",
            accessible: n.kind !== "stairs" && m.kind !== "stairs",
            estimated: false,
            physical: true,
            name:
              n.kind === "stairs" || m.kind === "stairs"
                ? `${n.building} physical stair flight`
                : `${n.building} · corridor junction`,
          });
        }
}
export function nearestPhysicalNode(
  p: Point,
  building?: string,
  floor?: number,
) {
  let best: GraphNode | undefined,
    dist = Infinity;
  for (const n of physicalNodes.values()) {
    if (
      (building && n.building !== building) ||
      (floor !== undefined && Math.abs(n.point[1] - floorY(floor)) > 0.3)
    )
      continue;
    const d = len(p, n.point);
    if (d < dist) {
      dist = d;
      best = n;
    }
  }
  return best;
}
export function physicalStats() {
  return {
    segments: segments.length,
    nodes: physicalNodes.size,
    edges: physicalEdges.length,
    doors: doors.length,
    entrances: entrances.length,
  };
}
