import {
  buildings,
  buildingById,
  places,
  resolveLocation,
} from "../data/campus";
import { computeRoute, minutes } from "../routing";
import type {
  ClassEvent,
  Weather,
  RouteProfile,
  GraphEdge,
  Point,
} from "../types";
import type { CampusEvent, CampusFeed, CampusState, PlaceState } from "./types";
import { resolveCampusLocation, resolveLocationId } from "./locations";
export const classPairs: [string, string, number][] = [
  ["MC", "DC", 180],
  ["DC", "E5", 120],
  ["SLC", "MC", 110],
  ["MC", "STC", 90],
  ["STC", "RCH", 90],
  ["E5", "PSE", 125],
  ["E2", "RCH", 130],
  ["HH", "AL", 100],
  ["AL", "ML", 75],
  ["LIB", "MC", 80],
  ["SLC", "PAC", 65],
  ["E5", "E6", 65],
  ["EV3", "HH", 65],
  ["DC", "SLC", 120],
  ["TC", "SCH", 70],
  ["CIF", "MC", 40],
  ["NH", "STC", 55],
  ["CPH", "E2", 80],
];
export interface FlowResult {
  edgeLoads: Map<string, number>;
  edgeDelays: Map<string, number>;
  bottlenecks: {
    id: string;
    name: string;
    peoplePerMinute: number;
    capacity: number;
    ratio: number;
    point: Point;
  }[];
  totalDemand: number;
  burst: number;
}
const flowCache = new Map<string, FlowResult>();
export function estimatedClassBurst(at: Date) {
  if (
    at.getDay() === 0 ||
    at.getDay() === 6 ||
    at.getHours() < 8 ||
    at.getHours() > 18
  )
    return 0.13;
  const m = at.getMinutes();
  return (
    0.25 +
    0.8 * Math.exp(-Math.pow((m - 25) / 7, 2)) +
    0.9 * Math.exp(-Math.pow((m - 55) / 7, 2))
  );
}
export function capacityPerMinute(e: GraphEdge) {
  return e.kind === "entrance"
    ? 42
    : e.kind === "stairs"
      ? 34
      : e.kind === "elevator"
        ? 18
        : e.kind === "bridge" || e.kind === "tunnel"
          ? 65
          : e.kind === "outdoor"
            ? 140
            : 90;
}
export function estimateFlow(at: Date, weather: Weather): FlowResult {
  const key = `${at.getDay()}-${at.getHours()}-${Math.floor(at.getMinutes() / 5)}-${weather.precipitation > 0}`;
  const existing = flowCache.get(key);
  if (existing) return existing;
  const burst = estimatedClassBurst(at),
    edgeLoads = new Map<string, number>(),
    edgeInfo = new Map<string, GraphEdge>(),
    edgePoints = new Map<string, Point>();
  let totalDemand = 0;
  for (const [from, to, students] of classPairs) {
    const demand = (students * burst) / 8;
    totalDemand += demand;
    const r = computeRoute(
      from,
      to,
      weather.precipitation > 0 ? "weather" : "fastest",
      weather,
      at.getHours(),
    );
    if (!r) continue;
    r.edges.forEach((e, i) => {
      edgeLoads.set(e.id, (edgeLoads.get(e.id) || 0) + demand);
      edgeInfo.set(e.id, e);
      edgePoints.set(e.id, r.nodes[i].point);
    });
  }
  const edgeDelays = new Map<string, number>();
  const candidates = [...edgeLoads]
    .map(([id, load]) => {
      const e = edgeInfo.get(id)!,
        capacity = capacityPerMinute(e),
        ratio = load / capacity;
      const delay = Math.min(
        65,
        Math.max(0, ratio - 0.5) * 12 + Math.pow(ratio, 4) * 2,
      );
      edgeDelays.set(id, delay);
      return {
        id,
        name: e.name || "Campus connection",
        peoplePerMinute: Math.round(load),
        capacity,
        ratio,
        point: edgePoints.get(id)!,
      };
    })
    .filter((x) => x.ratio > 0.3)
    .sort((a, b) => b.ratio - a.ratio);
  const bottlenecks: FlowResult["bottlenecks"] = [];
  for (const x of candidates)
    if (
      !bottlenecks.some(
        (b) =>
          Math.hypot(x.point[0] - b.point[0], x.point[2] - b.point[2]) < 35,
      ) &&
      bottlenecks.length < 5
    )
      bottlenecks.push(x);
  const result = {
    edgeLoads,
    edgeDelays,
    bottlenecks,
    totalDemand: Math.round(totalDemand),
    burst,
  };
  if (flowCache.size > 60) flowCache.clear();
  flowCache.set(key, result);
  return result;
}
export function weeklyEvents(classes: ClassEvent[], date: Date): CampusEvent[] {
  const all: CampusEvent[] = [];
  for (let offset = -1; offset < 8; offset++) {
    const day = new Date(date);
    day.setDate(date.getDate() + offset);
    for (const c of classes) {
      if (!c.days.includes(day.getDay())) continue;
      const [h, m] = c.start.split(":").map(Number),
        [eh, em] = c.end.split(":").map(Number);
      const start = new Date(day),
        end = new Date(day);
      start.setHours(h, m, 0, 0);
      end.setHours(eh, em, 0, 0);
      const location = resolveLocationId(c.location);
      if (!location) continue;
      all.push({
        id: `${c.id}-${start.toISOString().slice(0, 10)}`,
        title: c.title,
        start: start.toISOString(),
        end: end.toISOString(),
        locationText: location.name,
        location: {
          locationId: c.location,
          building: location.building,
          label: location.name,
          point: location.point,
          confidence: "room",
          reason: "Saved class location",
        },
        source: c.id.startsWith("demo") ? "Sample" : "Manual",
        personal: true,
      });
    }
  }
  return all;
}
export function watWayState(
  place: string,
  at: Date,
  events: CampusEvent[],
  feed: CampusFeed | undefined,
  weather: Weather,
  profile: RouteProfile,
  isLive = true,
): CampusState {
  const future = events
    .filter((e) => e.personal && Date.parse(e.end) > at.getTime() && !e.allDay)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nextEvent = future.find((e) => e.location?.locationId);
  const states: Record<string, PlaceState> = {};
  const burst = estimatedClassBurst(at);
  for (const b of buildings) {
    const readings = isLive
      ? feed?.facilities.filter(
          (r) =>
            r.building === b.id &&
            (r.status === "demo" ||
              (r.status === "live" &&
                Date.now() - Date.parse(r.updatedAt) < 5 * 60000)),
        )
      : [];
    const reading = readings?.length
      ? readings.reduce((a, c) => (a.percent > c.percent ? a : c))
      : undefined;
    const h = at.getHours(),
      day = at.getDay();
    let occ = 0.2 + 0.45 * Math.exp(-Math.pow((h - 14) / 5, 2)) + 0.2 * burst;
    if (["PAC", "CIF"].includes(b.id))
      occ =
        0.15 +
        0.55 * Math.exp(-Math.pow((h - 18) / 4, 2)) +
        0.13 * Math.exp(-Math.pow((h - 12) / 2, 2));
    if (["SLC", "SCH"].includes(b.id))
      occ = 0.2 + 0.5 * Math.exp(-Math.pow((h - 12.5) / 1.7, 2));
    if (day === 0 || day === 6) occ *= 0.55;
    if (h < 7 || h > 23) occ *= 0.1;
    const utilization = Math.min(0.92, occ);
    states[b.id] = {
      building: b.id,
      occupancy: reading?.percent ?? Math.round(Math.min(0.98, occ) * 100),
      occupancyKind: reading?.status === "live" ? "live" : "estimate",
      pedestrianFactor: 1 + burst * 0.16,
      queueSeconds: Math.round(12 + (utilization / (1 - utilization)) * 6),
      open: "unknown",
      source: reading?.source,
    };
  }
  const nextRoute = nextEvent?.location?.locationId
    ? computeRoute(
        place,
        nextEvent.location.locationId,
        profile,
        weather,
        at.getHours(),
      )
    : null;
  const leaveAt =
    nextEvent && nextRoute
      ? new Date(
          Date.parse(nextEvent.start) - nextRoute.seconds * 1000 - 180000,
        )
      : undefined;
  const gapMinutes = nextEvent
    ? Math.max(
        0,
        Math.floor((Date.parse(nextEvent.start) - at.getTime()) / 60000) -
          minutes(nextRoute) -
          3,
      )
    : 0;
  return {
    time: at,
    isLive,
    place,
    states,
    nextEvent,
    events,
    leaveAt,
    gapMinutes,
    congestionLevel:
      burst > 1
        ? "Class change"
        : burst > 0.7
          ? "Busy"
          : burst > 0.2
            ? "Typical"
            : "Quiet",
    flowScale: burst,
  };
}
// A capacity-only cut on the coarse building-connection network. Values are estimates, not measured evacuation capacities.
export function buildingMinCut(
  from: string,
  to: string,
  links: { from: string; to: string; capacity: number }[],
) {
  if (from === to) return { capacity: 0, cut: [] as typeof links };
  const residual = new Map<string, Map<string, number>>();
  const add = (a: string, b: string, c: number) => {
    if (!residual.has(a)) residual.set(a, new Map());
    residual.get(a)!.set(b, (residual.get(a)!.get(b) || 0) + c);
  };
  for (const l of links) {
    add(l.from, l.to, l.capacity);
    add(l.to, l.from, l.capacity);
  }
  let flow = 0;
  for (let round = 0; round < 200; round++) {
    const parent = new Map<string, string>(),
      queue = [from];
    parent.set(from, "");
    for (let i = 0; i < queue.length && !parent.has(to); i++)
      for (const [n, c] of residual.get(queue[i]) || []) {
        if (c > 0 && !parent.has(n)) {
          parent.set(n, queue[i]);
          queue.push(n);
        }
      }
    if (!parent.has(to)) break;
    let cap = Infinity;
    for (let cur = to; cur !== from; cur = parent.get(cur)!)
      cap = Math.min(cap, residual.get(parent.get(cur)!)!.get(cur)!);
    for (let cur = to; cur !== from; cur = parent.get(cur)!) {
      const prev = parent.get(cur)!;
      residual.get(prev)!.set(cur, residual.get(prev)!.get(cur)! - cap);
      residual.get(cur)!.set(prev, (residual.get(cur)!.get(prev) || 0) + cap);
    }
    flow += cap;
  }
  const reachable = new Set([from]),
    queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const [n, c] of residual.get(queue[i]) || [])
      if (c > 0 && !reachable.has(n)) {
        reachable.add(n);
        queue.push(n);
      }
  return {
    capacity: flow,
    cut: links.filter((l) => reachable.has(l.from) !== reachable.has(l.to)),
  };
}
export function gapRecommendations(state: CampusState, weather: Weather) {
  const next = state.nextEvent?.location?.locationId;
  const origin = state.place;
  const candidates = places.filter(
    (p) => ["study", "food", "recreation"].includes(p.category) && p.floor > 0,
  );
  return candidates
    .map((p) => {
      const there = computeRoute(
        origin,
        p.id,
        "fastest",
        weather,
        state.time.getHours(),
      );
      if (!there) return null;
      const onward = next
        ? computeRoute(p.id, next, "fastest", weather, state.time.getHours())
        : null;
      const travel = minutes(there) + minutes(onward);
      const spare = state.nextEvent
        ? Math.floor(
            (Date.parse(state.nextEvent.start) - state.time.getTime()) / 60000,
          ) -
          travel -
          3
        : 60;
      const h = state.time.getHours(),
        categoryFit =
          p.category === "food" && h >= 11 && h <= 14
            ? 16
            : p.category === "study"
              ? 10
              : 0;
      const occupancy = state.states[p.building]?.occupancy || 50;
      return {
        place: p,
        walk: minutes(there),
        spare,
        occupancy,
        score: categoryFit + spare * 0.08 - minutes(there) - occupancy * 0.1,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r && r.spare >= 15)
    .sort((a, b) => b.score - a.score)
    .filter(
      (r, i, a) =>
        a.findIndex(
          (x) =>
            x.place.building === r.place.building &&
            x.place.category === r.place.category,
        ) === i,
    )
    .slice(0, 3);
}
