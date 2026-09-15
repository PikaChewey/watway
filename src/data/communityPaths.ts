import raw from "./watisgrass.json";
import { buildingById, project } from "./campus";
import type { Point } from "../types";
export interface CommunityPath {
  id: string;
  kind: "bridge" | "tunnel" | "hallway";
  from: string;
  to: string;
  fromFloor: number;
  toFloor: number;
  points: Point[];
  source: string;
  accessible: boolean;
}
const code = (s: string) => (s === "E7" ? "PSE" : s === "DP" ? "LIB" : s);
const floor = (s: string) => (s === "B" ? 0 : parseInt(s) || 1);
export const communityPaths: CommunityPath[] = raw.features.flatMap(
  (f: any) => {
    const p = f.properties;
    if (
      !["bridge", "tunnel", "hallway"].includes(p.type) ||
      f.geometry.type !== "LineString"
    )
      return [];
    const from = code(p.start.buildingCode),
      to = code(p.end.buildingCode);
    if (!buildingById[from] || !buildingById[to]) return [];
    if (
      [from, to].includes("MC") &&
      ([from, to].includes("DC") || [from, to].includes("M3"))
    )
      return [];
    const fa = floor(p.start.floor),
      fb = floor(p.end.floor);
    for (const [id, n] of [
      [from, fa],
      [to, fb],
    ] as [string, number][])
      if (n > buildingById[id].floors) {
        buildingById[id].floors = n;
        buildingById[id].height = Math.max(buildingById[id].height, n * 3.8);
      }
    return [
      {
        id: f.id,
        kind: p.type,
        from,
        to,
        fromFloor: fa,
        toFloor: fb,
        points: f.geometry.coordinates.map((c: number[], i: number) => {
          const point = project(c[1], c[0]);
          point[1] =
            (fa +
              ((fb - fa) * i) / Math.max(1, f.geometry.coordinates.length - 1) -
              1) *
              3.8 +
            1;
          return point;
        }),
        source: "https://github.com/rickyqin005/WATIsGrass",
        accessible:
          p.type !== "tunnel" &&
          !([from, to].includes("C2") && [from, to].includes("DC")),
      },
    ];
  },
);
export const communityLinks = communityPaths.filter(
  (p) => p.kind === "bridge" || p.kind === "tunnel",
);
