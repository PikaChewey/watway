import{coveredBuildings,physicalNodes,physicalEdges,entrances as physicalEntrances,doors as physicalDoors,nearestPhysicalNode,floorY,segmentWalkable}from"./navigation/physicalModel";
import { communityLinks } from "./data/communityPaths";
import {
  indoorFeatures,
  dcWalls,
  segmentBlocked,
  pointInPolygon,
  collides,
} from "./indoor";
import {
  buildings,
  mapFeatures,
  buildingById,
  places,
  placeById,
  connections,
  distance,
  resolveLocation,
  closure,
} from "./data/campus";
import type {
  Point,
  GraphNode,
  GraphEdge,
  Route,
  RouteProfile,
  Weather,
  EdgeKind,
  RouteStep,
} from "./types";
export const nodes = new Map<string, GraphNode>();
export const edges: GraphEdge[] = [];
const adj = new Map<string, GraphEdge[]>();
function node(n: GraphNode) {
  if (!nodes.has(n.id)) {
    nodes.set(n.id, n);
    adj.set(n.id, []);
  }
  return n.id;
}
function edge(
  from: string,
  to: string,
  kind: EdgeKind,
  accessible = true,
  estimated = false,
  name?: string,
  closed = false,
) {
  if (from === to || !nodes.has(from) || !nodes.has(to)) return;
  const d = distance(nodes.get(from)!.point, nodes.get(to)!.point);
  const e: GraphEdge = {
    id: `${from}|${to}|${kind}`,
    from,
    to,
    kind,
    distance: Math.max(d, 1),
    accessible,
    estimated,
    name,
    closed,
  };
  edges.push(e);
  adj.get(from)!.push(e);
  adj.get(to)!.push(e);
}
export const floorId = (b: string, f: number) => `${b}:f${f}`;
function inside(p: Point, poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[2] !== b[1] > p[2] &&
      p[0] < ((b[0] - a[0]) * (p[2] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}
const pathFeatures = mapFeatures.filter(
  (f) =>
    (f.type === "path" || f.type === "road") &&
    f.access !== "private" &&
    f.access !== "no",
);
for (const f of pathFeatures) {
  const ids = f.points.map((p, i) =>
    node({
      id: f.nodes?.[i] ? `osm-${f.nodes[i]}` : `geo-${p[0]}-${p[1]}`,
      point: [p[0], 0.3, p[1]],
      kind: "path",
      label: f.name || undefined,
    }),
  );
  for (let i = 1; i < ids.length; i++) {
    const a = nodes.get(ids[i - 1])!.point,
      b = nodes.get(ids[i])!.point;
    const mid: Point = [(a[0] + b[0]) / 2, 0.3, (a[2] + b[2]) / 2];
    const inConstruction =
      Math.abs(mid[0] - closure.point[0]) < 26 &&
      Math.abs(mid[2] - closure.point[2]) < 33;
    edge(
      ids[i - 1],
      ids[i],
      f.stairs ? "stairs" : "outdoor",
      !f.stairs && f.surface !== "steps",
      false,
      f.name || "Campus path",
      inConstruction,
    );
  }
}
const pathNodes = [...nodes.values()];
// Join tiny geometry gaps where public paths end at the same real-world junction.
const cells = new Map<string, GraphNode[]>();
for (const n of pathNodes) {
  const key = `${Math.floor(n.point[0] / 10)},${Math.floor(n.point[2] / 10)}`;
  const arr = cells.get(key) || [];
  arr.push(n);
  cells.set(key, arr);
}
for (const n of pathNodes) {
  const cx = Math.floor(n.point[0] / 10),
    cz = Math.floor(n.point[2] / 10);
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++)
      for (const m of cells.get(`${cx + x},${cz + z}`) || []) {
        if (
          n.id < m.id &&
          distance(n.point, m.point) < 3 &&
          !adj.get(n.id)!.some((e) => e.from === m.id || e.to === m.id)
        )
          edge(n.id, m.id, "outdoor", true, true, "Path connection");
      }
}
for (const b of buildings) {
  // A schematic vertical circulation core is separate from the georeferenced outdoor network.
  for (let f = 0; f <= b.floors; f++)
    node({
      id: floorId(b.id, f),
      point: [b.center[0], (f - 1) * 3.8 + 1, b.center[2]],
      kind: "hallway",
      building: b.id,
      floor: f,
      label: `${b.id} · Floor ${f === 0 ? "B" : f}`,
    });
  for (let f = 0; f < b.floors; f++) {
    edge(
      floorId(b.id, f),
      floorId(b.id, f + 1),
      "stairs",
      false,
      true,
      `${b.id} stairwell`,
    );
    if (!(b.id === "DC" && f === 0))
      edge(
        floorId(b.id, f),
        floorId(b.id, f + 1),
        "elevator",
        true,
        true,
        `${b.id} elevator`,
      );
  }
  // Use the nearest path point to the building boundary, then connect the entrance to the core.
  const ranked = pathNodes
    .map((n) => ({
      n,
      d: Math.min(
        ...b.polygon.map((p) =>
          Math.hypot(n.point[0] - p[0], n.point[2] - p[1]),
        ),
      ),
    }))
    .sort((a, b) => a.d - b.d);
  const picks: GraphNode[] = [];
  for (const r of ranked) {
    if (picks.length >= 3) break;
    if (r.d > 80 && picks.length) break;
    if (!picks.some((n) => distance(n.point, r.n.point) < 25)) picks.push(r.n);
  }
  picks.forEach((n, i) => {
    let best: Point = b.center,
      bd = Infinity;
    for (let j = 1; j < b.polygon.length; j++) {
      const a = b.polygon[j - 1],
        c = b.polygon[j];
      const dx = c[0] - a[0],
        dz = c[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((n.point[0] - a[0]) * dx + (n.point[2] - a[1]) * dz) /
            (dx * dx + dz * dz || 1),
        ),
      );
      const p: Point = [a[0] + dx * t, 0.5, a[1] + dz * t];
      const d = distance(p, n.point);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    const id = node({
      id: `${b.id}:entry${i}`,
      point: best,
      kind: "entrance",
      building: b.id,
      floor: 1,
      label: `${b.id} entrance`,
    });
    edge(n.id, id, "outdoor", true, true, "Approach entrance");
    edge(id, floorId(b.id, 1), "entrance", true, true, `Enter ${b.shortName}`);
  });
}
// Reconstruct the mapped Davis ground floor as a walkable grid bounded by actual room walls and door gaps.
const dcGrid: GraphNode[] = [];
const dc = buildingById.DC;
if (dc) {
  const xs = dc.polygon.map((p) => p[0]),
    zs = dc.polygon.map((p) => p[1]);
  const step = 1.25;
  const minX = Math.floor(Math.min(...xs) / step),
    maxX = Math.ceil(Math.max(...xs) / step),
    minZ = Math.floor(Math.min(...zs) / step),
    maxZ = Math.ceil(Math.max(...zs) / step);
  const cells = new Map<string, string>();
  for (let x = minX; x <= maxX; x++)
    for (let z = minZ; z <= maxZ; z++) {
      const px = x * step,
        pz = z * step;
      if (!pointInPolygon(px, pz, dc.polygon) || collides(px, pz, 0.18))
        continue;
      const id = node({
        id: `dcgrid:${x}:${z}`,
        point: [px, 1, pz],
        kind: "hallway",
        building: "DC",
        floor: 1,
      });
      cells.set(`${x},${z}`, id);
      dcGrid.push(nodes.get(id)!);
    }
  for (const [key, id] of cells) {
    const [x, z] = key.split(",").map(Number);
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ]) {
      const other = cells.get(`${x + dx},${z + dz}`);
      if (
        other &&
        !segmentBlocked(nodes.get(id)!.point, nodes.get(other)!.point, 0.12)
      )
        edge(id, other, "indoor", true, false, "Davis Centre corridor");
    }
  }
  const connect = (id: string) => {
    const n = nodes.get(id)!;
    const candidates = dcGrid
      .map((g) => ({ g, d: distance(n.point, g.point) }))
      .sort((a, b) => a.d - b.d);
    const best = candidates.find(
      (c) => c.d < 15 && !segmentBlocked(n.point, c.g.point, 0.08),
    );
    if (best)
      edge(
        id,
        best.g.id,
        "indoor",
        true,
        false,
        "Mapped Davis Centre interior",
      );
  };
  // Replace straight-line interior spokes with the mapped walkable graph.
  for (const e of edges) {
    if (
      e.kind === "entrance" &&
      (e.from === floorId("DC", 1) || e.to === floorId("DC", 1))
    )
      e.closed = true;
  }
  const core = nodes.get(floorId("DC", 1))!;
  const corridor = indoorFeatures.find(
    (f) =>
      f.type === "corridor" &&
      f.building === "DC" &&
      f.levels.includes(1) &&
      f.points.length > 1,
  );
  if (corridor) core.point = [corridor.points[0][0], 1, corridor.points[0][1]];
  connect(core.id);
  for (const n of [...nodes.values()].filter(
    (n) => n.building === "DC" && n.kind === "entrance",
  ))
    connect(n.id);
  // Use mapped exterior doors as additional entrances.
  for (const f of indoorFeatures.filter(
    (f) => f.type === "entrance" && f.building === "DC" && f.levels.includes(1),
  )) {
    const p: Point = [f.points[0][0], 1, f.points[0][1]];
    const id = node({
      id: `dc-entry-${f.id}`,
      point: p,
      kind: "entrance",
      building: "DC",
      floor: 1,
      label: "Davis Centre mapped entrance",
    });
    connect(id);
    const near = pathNodes
      .map((n) => ({ n, d: distance(n.point, p) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < 30)
      edge(
        id,
        near.n.id,
        "outdoor",
        f.wheelchair !== "no",
        false,
        "Davis Centre entrance",
      );
  }
}
for (const [a, b, kind, fa, fb, accessible, note] of connections) {
  if (
    buildingById[a] &&
    buildingById[b] &&
    !communityLinks.some(
      (p) => (p.from === a && p.to === b) || (p.from === b && p.to === a),
    )
  )
    edge(
      floorId(a, fa),
      floorId(b, fb),
      kind,
      accessible,
      true,
      note || `${a} → ${b} ${kind}`,
    );
}
for (const path of communityLinks) {
  const ids = path.points.map((point, i) =>
    node({
      id: `community:${path.id}:${i}`,
      point,
      kind: "hallway",
      building: i < path.points.length / 2 ? path.from : path.to,
      floor: i < path.points.length / 2 ? path.fromFloor : path.toFloor,
      label: `${path.from}–${path.to} ${path.kind}`,
    }),
  );
  for (let i = 1; i < ids.length; i++)
    edge(
      ids[i - 1],
      ids[i],
      path.kind === "hallway" ? "indoor" : path.kind,
      path.accessible,
      false,
      `${path.from}–${path.to} ${path.kind} · WATIsGrass`,
    );
  edge(
    floorId(path.from, path.fromFloor),
    ids[0],
    "indoor",
    path.accessible,
    true,
    `${path.from} approach to ${path.kind}`,
  );
  edge(
    ids[ids.length - 1],
    floorId(path.to, path.toFloor),
    "indoor",
    path.accessible,
    true,
    `${path.to} approach to ${path.kind}`,
  );
}
for(const n of nodes.values())if(n.building==="DC"&&n.floor===1)n.point[1]=.5;for(const p of places)if(p.building==="DC"&&p.floor===1)p.point[1]=.5;
// Priority interiors use the physical model exclusively. Remove abstract floor jumps and centre spokes.
for(const e of edges){const a=nodes.get(e.from),b=nodes.get(e.to);const priority=[a,b].some(n=>n?.building&&coveredBuildings.has(n.building));const davisMapped=a?.building==='DC'&&b?.building==='DC'&&a.floor===1&&b.floor===1&&!e.estimated;
 if(priority&&e.kind!=='outdoor'&&!davisMapped)e.closed=true;
}
for(const n of physicalNodes.values())node(n);
for(const e of physicalEdges){edges.push(e);adj.get(e.from)!.push(e);adj.get(e.to)!.push(e)}
for(const building of coveredBuildings){const b=buildingById[building];if(!b)continue;for(let f=0;f<=b.floors;f++){const alias=nodes.get(floorId(building,f));const entry=f===1?physicalEntrances.find(e=>e.building===building&&e.floor===1):undefined;const nearest=nearestPhysicalNode(entry?.outside||b.center,building,f) || (f===1?nearestPhysicalNode(b.center,building):undefined);if(alias&&nearest){alias.point=[...nearest.point];edge(alias.id,nearest.id,'indoor',true,false,`${building} · floor ${f} corridor`);const e=edges[edges.length-1];e.physical=true;}}}
for(const entry of physicalEntrances){const insideNode=nearestPhysicalNode(entry.outside,entry.building,entry.floor);if(!insideNode)continue;node({id:entry.id,point:[...insideNode.point],kind:'entrance',building:entry.building,floor:entry.floor,label:`${entry.building} mapped entrance`});edge(entry.id,insideNode.id,'entrance',true,false,`Enter ${entry.building} through mapped door`);edges[edges.length-1].physical=true;
 if(entry.floor===1){const near=pathNodes.reduce((a,b)=>distance(a.point,entry.outside)<distance(b.point,entry.outside)?a:b);if(distance(near.point,entry.outside)<35){edge(near.id,entry.id,'outdoor',true,true,'Approach mapped entrance');edges[edges.length-1].physical=true;}}
}
// Join the existing mapped Davis floor mesh to the same physical inter-building network.
for(const n of physicalNodes.values()){if(n.building!=='DC'||Math.abs(n.point[1]-.5)>.1)continue;const candidates=dcGrid.map(g=>({g,d:Math.hypot(g.point[0]-n.point[0],g.point[2]-n.point[2])})).filter(x=>x.d<1.3).sort((a,b)=>a.d-b.d);const candidate=candidates.find(x=>!segmentBlocked(n.point,x.g.point));if(candidate){edge(n.id,candidate.g.id,'indoor',true,false,'Davis mapped corridor junction');edges[edges.length-1].physical=true}}
function ensurePlace(id: string) {
  const p = placeById[id];
  if(p&&coveredBuildings.has(p.building)&&!(p.building==='DC'&&p.floor===1)){
    if(nodes.has(id))return;
    const door=physicalDoors.find(d=>d.id===id);if(p.category==='room'&&!door)return;
    const nearest=nearestPhysicalNode(door?.point||p.point,p.building,p.floor);if(!nearest)return;
    p.point=[...nearest.point];node({id,point:p.point,kind:p.category==='room'?'room':'hallway',building:p.building,floor:p.floor,label:p.name});edge(id,nearest.id,'indoor',true,!!door?.estimated,door?`Arrive at ${p.name} door`:`${p.name} · corridor access`);edges[edges.length-1].physical=true;return;
  }
  if (p && !nodes.has(id)) {
    node({
      id,
      point: p.point,
      kind: p.category === "room" ? "room" : "hallway",
      building: p.building,
      floor: p.floor,
      label: p.name,
    });
    if (p.floor === 0 && p.category !== "room") {
      const closest = pathNodes.reduce((a, b) =>
        distance(a.point, p.point) < distance(b.point, p.point) ? a : b,
      );
      edge(id, closest.id, "outdoor", true, true, "Approach destination");
    } else if (p.building === "DC" && p.floor === 1 && dcGrid.length) {
      const ranked = dcGrid
        .map((g) => ({ g, d: distance(p.point, g.point) }))
        .sort((a, b) => a.d - b.d);
      const near = ranked.find(
        (c) => c.d < 20 && !segmentBlocked(p.point, c.g.point, 0.1),
      );
      if (near)
        edge(
          id,
          near.g.id,
          "indoor",
          true,
          p.confidence !== "verified",
          `Find ${p.name}`,
        );
    } else
      edge(
        id,
        floorId(p.building, p.floor),
        "indoor",
        true,
        true,
        `Find ${p.name}`,
      );
  }
}
places.forEach((p) => ensurePlace(p.id));
export function addLocation(id: string, point: Point) {
  node({ id, point, kind: "path", label: "Your location" });
  const nearest = pathNodes.reduce((a, b) =>
    distance(a.point, point) < distance(b.point, point) ? a : b,
  );
  edge(id, nearest.id, "outdoor", true, true, "Join campus path");
}
// Floor aliases are relocated to physical corridors during assembly. Refresh
// incident lengths so the geometric A* lower bound never exceeds an edge cost.
for (const e of edges) e.distance = Math.max(e.distance, distance(nodes.get(e.from)!.point, nodes.get(e.to)!.point));
function routingEndpoint(id: string) {
  if (!buildingById[id]) return id;
  const floor = floorId(id, 1);
  if (adj.get(floor)?.some(e => !e.closed)) return floor;
  // Some mapped buildings have only exterior access in our graph (e.g. PAC).
  // End at an existing public approach instead of inventing an indoor connector.
  return [...nodes.values()].find(n => n.building === id && n.kind === "entrance" && adj.get(n.id)?.some(e => !e.closed && e.kind === "outdoor"))?.id || floor;
}
export const graphStats = {
  nodes: nodes.size,
  edges: edges.length,
  buildings: buildings.length,
};
export function congestion(
  hour: number = new Date().getHours(),
  minute: number = new Date().getMinutes(),
  day: number = new Date().getDay(),
) {
  const weekday = day % 6 !== 0;
  return weekday && hour >= 9 && hour <= 17
    ? (minute >= 20 && minute <= 35) || minute >= 50
      ? 1.23
      : 1.08
    : 1;
}
export function elevatorEstimate(hour: number = new Date().getHours()) {
  return hour >= 9 && hour <= 17 ? 24 : 12;
}
export function weatherCostModel(weather: Pick<Weather, "precipitation" | "code">) {
  const snow = weather.code >= 71 && weather.code <= 86;
  const wet = weather.precipitation > 0 || weather.code >= 51;
  return { label: snow ? "Winter snow" : wet ? "Rain" : "Dry", outdoorMultiplier: snow ? 1.32 : wet ? 1.13 : 1, exposurePenalty: snow ? 6 : wet ? 3 : weather.code === 45 ? .5 : .12 };
}
function travelSeconds(
  e: GraphEdge,
  hour: number,
  crowd: number,
  weather: Pick<Weather, "precipitation" | "code">,
) {
  if (e.kind === "elevator") return elevatorEstimate(hour) + e.distance / 1.5;
  if (e.kind === "stairs") return e.distance / 0.35;
  const speed = e.kind === "outdoor" ? 1.35 : 1.15;
  const rain = e.kind === "outdoor" ? weatherCostModel(weather).outdoorMultiplier : 1;
  return (e.distance / speed) * crowd * rain + (e.kind === "entrance" ? 4 : 0);
}
function weight(
  e: GraphEdge,
  profile: RouteProfile,
  hour: number,
  crowd: number,
  weather: Pick<Weather, "precipitation" | "code">,
) {
  if (e.closed || (profile === "accessible" && !e.accessible)) return Infinity;
  const seconds = travelSeconds(e, hour, crowd, weather);
  if (profile === "shortest") return e.distance;
  if (profile === "indoor")
    return seconds + (e.kind === "outdoor" ? e.distance * 5 : 0);
  if (profile === "weather")
    return (
      seconds +
      (e.kind === "outdoor"
        ? e.distance *
          weatherCostModel(weather).exposurePenalty
        : 0)
    );
  if (profile === "stairs") return seconds + (e.kind === "stairs" ? 300 : 0);
  return seconds;
}
class Heap {
  a: { id: string; d: number; g: number }[] = [];
  push(v: { id: string; d: number; g: number }) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].d <= v.d) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = v;
  }
  pop() {
    const a = this.a;
    if (!a.length) return;
    const root = a[0],
      v = a.pop()!;
    if (a.length) {
      let i = 0;
      while (2 * i + 1 < a.length) {
        let c = 2 * i + 1;
        if (c + 1 < a.length && a[c + 1].d < a[c].d) c++;
        if (a[c].d >= v.d) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = v;
    }
    return root;
  }
}
export function computeRoute(
  from: string,
  to: string,
  profile: RouteProfile = "fastest",
  weather: Pick<Weather, "precipitation" | "code"> = {
    precipitation: 0,
    code: 0,
  },
  hour = new Date().getHours(),
  context: { at?: Date; edgeDelays?: Map<string, number>; algorithm?: "astar" | "dijkstra" } = {},
): Route | null {
  const started = performance.now();
  ensurePlace(from);
  ensurePlace(to);
  const start = routingEndpoint(from),
    end = routingEndpoint(to);
  if (!nodes.has(start) || !nodes.has(end)) return null;
  const dist = new Map<string, number>([[start, 0]]),
    prev = new Map<string, { id: string; e: GraphEdge }>();
  const heap = new Heap();
  // Every edge length covers its Euclidean displacement. 1.5 m/s is the
  // fastest permitted transport, so this lower bound is admissible for all profiles.
  const heuristic = (id: string) => context.algorithm === "dijkstra" ? 0 : distance(nodes.get(id)!.point, nodes.get(end)!.point) / (profile === "shortest" ? 1 : 1.5);
  heap.push({ id: start, d: heuristic(start), g: 0 });
  let expanded = 0, relaxed = 0;
  const crowd = congestion(
    hour,
    context.at?.getMinutes() ?? new Date().getMinutes(),
    context.at?.getDay(),
  );
  while (heap.a.length) {
    const cur = heap.pop()!;
    if (cur.g !== dist.get(cur.id)) continue;
    expanded++;
    if (cur.id === end) break;
    for (const e of adj.get(cur.id) || []) {
      const other = e.from === cur.id ? e.to : e.from;
      const nd =
        cur.g +
        weight(e, profile, hour, crowd, weather) +
        (profile === "shortest" ? 0 : context.edgeDelays?.get(e.id) || 0);
      if (nd < (dist.get(other) ?? Infinity)) {
        relaxed++;
        dist.set(other, nd);
        prev.set(other, { id: cur.id, e });
        heap.push({ id: other, d: nd + heuristic(other), g: nd });
      }
    }
  }
  if (!dist.has(end)) return null;
  const ns: GraphNode[] = [nodes.get(end)!],
    es: GraphEdge[] = [];
  let cur = end;
  while (cur !== start) {
    const p = prev.get(cur);
    if (!p) return null;
    es.push(p.e);
    cur = p.id;
    ns.push(nodes.get(cur)!);
  }
  ns.reverse();
  es.reverse();
  const total = es.reduce((s, e) => s + e.distance, 0),
    out = es
      .filter((e) => e.kind === "outdoor")
      .reduce((s, e) => s + e.distance, 0);
  const result: Route = {
    nodes: ns,
    edges: es,
    search: { algorithm: context.algorithm === "dijkstra" ? "Dijkstra" : "A*", expanded, relaxed, discovered: dist.size, milliseconds: performance.now() - started, cost: dist.get(end)! },
    distance: total,
    seconds: es.reduce(
      (s, e) =>
        s +
        travelSeconds(e, hour, crowd, weather) +
        (context.edgeDelays?.get(e.id) || 0),
      0,
    ),
    outdoorDistance: out,
    indoorPercent: total ? Math.round((1 - out / total) * 100) : 100,
    stairs: es.filter((e) => e.kind === "stairs").length,
    elevatorWait:
      es.filter((e) => e.kind === "elevator").length * elevatorEstimate(hour),
    profile,
    steps: [],
    estimated: es.some((e) => e.estimated),
  };
  // Consecutive elevator edges represent one ride, so charge one wait per uninterrupted ride.
  for (let i = 1; i < es.length; i++)
    if (es[i].kind === "elevator" && es[i - 1].kind === "elevator") {
      result.seconds -= elevatorEstimate(hour);
      result.elevatorWait -= elevatorEstimate(hour);
    }
  result.physical=es.every(e=>e.physical||e.kind==="outdoor"||(!e.estimated&&nodes.get(e.from)?.building==="DC"&&nodes.get(e.from)?.floor===1));
  result.steps = makeSteps(result);
  return result;
}
function makeSteps(route: Route): RouteStep[] {
  const result: RouteStep[] = [];
  route.edges.forEach((e, i) => {
    const a = route.nodes[i],
      b = route.nodes[i + 1];
    const prev = result[result.length - 1];
    const canMerge =
      prev &&
      prev.kind === e.kind &&
      (["stairs", "elevator"].includes(e.kind) ||
        (e.kind === "outdoor" &&
          (i === 0 ||
            e.distance < 5 ||
            (() => {
              const p = route.nodes[i - 1].point,
                q = a.point,
                r = b.point;
              const ux = q[0] - p[0],
                uz = q[2] - p[2],
                vx = r[0] - q[0],
                vz = r[2] - q[2];
              return (
                (ux * vx + uz * vz) /
                  (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1) >
                0.82
              );
            })())) ||
        (a.building === b.building &&
          e.kind === "indoor" &&
          b.kind !== "room"));
    if (canMerge) {
      prev.distance += e.distance;
      prev.edgeEnd = i;
      if (e.kind === "elevator" || e.kind === "stairs")
        prev.title = `${e.kind === "elevator" ? "Take the elevator" : "Take the stairs"} to ${b.floor === 0 ? "the basement" : `floor ${b.floor}`}`;
      return;
    }
    let title = "",
      detail = "";
    switch (e.kind) {
      case "outdoor":
        title =
          e.name === "Campus path"
            ? "Follow the campus path"
            : e.name || "Walk outside";
        detail = "Outdoor · follow marked pedestrian paths";
        break;
      case "entrance":
        title =
          b.kind === "entrance"
            ? `Exit ${buildingById[a.building!]?.shortName || a.building}`
            : `Enter ${buildingById[b.building!]?.shortName || b.building}`;
        detail = "Entrance position is approximate";
        break;
      case "bridge":
        title = `Cross the ${a.building}–${b.building} bridge`;
        detail = `Floor ${a.floor} → ${b.floor} · connection model, check signs`;
        break;
      case "tunnel":
        title = `Take the tunnel to ${b.building}`;
        detail = "Below ground · follow building signs";
        break;
      case "elevator":
        title = `Take the elevator to ${b.floor === 0 ? "the basement" : `floor ${b.floor}`}`;
        detail = `Estimated wait ${elevatorEstimate()} sec · status unverified`;
        break;
      case "stairs":
        title =
          b.floor === undefined
            ? "Take the outdoor steps"
            : `Take the stairs to ${b.floor === 0 ? "the basement" : `floor ${b.floor}`}`;
        detail =
          b.floor === undefined
            ? "Mapped outdoor steps"
            : "Schematic stairwell location";
        break;
      default:
        title =
          b.kind === "room"
            ? `Find ${b.label}`
            : a.building !== b.building
              ? `Continue inside to ${b.building}`
              : `Continue through ${b.building}`;
        detail =
          !e.estimated && b.building === "DC"
            ? "Mapped Davis corridor · follow room signs"
            : "Schematic interior · use posted room signs";
    }
    result.push({
      title,
      detail,
      kind: e.kind,
      distance: e.distance,
      point: a.point,
      edgeStart: i,
      edgeEnd: i,
    });
  });
  return result;
}
export const profileLabels: Record<RouteProfile, string> = {
  fastest: "Fastest",
  shortest: "Shortest",
  indoor: "Most indoor",
  accessible: "Step-free",
  stairs: "Least stairs",
  weather: "Weather-smart",
};
export const minutes = (r: Route | null) =>
  r ? Math.max(1, Math.ceil(r.seconds / 60)) : 0;
export function routePoint(
  route: Route,
  progress: number,
): { point: Point; next: Point; edgeIndex: number } {
  const target = Math.max(0, Math.min(1, progress)) * route.distance;
  let total = 0;
  for (let i = 0; i < route.edges.length; i++) {
    const d = route.edges[i].distance;
    if (total + d >= target) {
      const t = (target - total) / d,
        a = route.nodes[i].point,
        b = route.nodes[i + 1].point;
      return {
        point: [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ],
        next: b,
        edgeIndex: i,
      };
    }
    total += d;
  }
  const p = route.nodes[route.nodes.length - 1].point;
  return { point: p, next: p, edgeIndex: Math.max(0, route.edges.length - 1) };
}
