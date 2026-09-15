import {
  buildings,
  buildingById,
  findRoom,
  resolveLocation,
  project,
} from "../data/campus";
import type { ResolvedLocation, CampusEvent } from "./types";
const nicknames: Record<string, string> = {
  "dana porter": "LIB",
  "dana porter library": "LIB",
  dp: "LIB",
  "dc library": "DC",
  "davis centre library": "DC",
  "davis center": "DC",
  "davis centre": "DC",
  "math and computer": "MC",
  "math computer": "MC",
  "math c&d": "MC",
  "math c and d": "MC",
  "student life center": "SLC",
  "student life centre": "SLC",
  "slc marketplace": "SLC",
  "engineering 7": "PSE",
  e7: "PSE",
  "pearl sullivan": "PSE",
  robohub: "PSE",
  "helix lab": "RCH",
  "rod coutts": "RCH",
  "rod coutts hall": "RCH",
  "r c h": "RCH",
  "quantum nano": "QNC",
  tatham: "TC",
  "hagey hall": "HH",
  "physical activities complex": "PAC",
  "columbia icefield": "CIF",
  "needles hall": "NH",
  "earth sciences museum": "EIT",
  "east campus hall": "ECH",
  "university of waterloo station": "E5",
  "science teaching complex": "STC",
  "science and technology complex": "STC",
};
export function resolveCampusLocation(
  input: string,
): ResolvedLocation | undefined {
  if (!input?.trim()) return;
  const text = input
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const lower = text.toLowerCase();
  if (
    /\b(online|virtual|zoom|microsoft teams|google meet)\b/.test(lower) &&
    !/(?:\b(?:MC|DC|SLC|E[2-7]|PSE|RCH)\b|200 University)/i.test(text)
  )
    return;
  if (
    /\b(toronto|kitchener|laurier|uptown|waterloo town square|communitech|cambridge|king.?s college|trinity bellwoods)\b/i.test(
      text,
    )
  )
    return;
  const roomMatch = text.match(
    /\b(MC|DC|SLC|RCH|QNC|STC|E[2-7]|PSE|CPH|DWE|HH|AL|M3|EV[1-3]|PHY|EIT|LIB|DP|TC|NH|PAS)\s*(?:room\s*|[-–:]\s*)?(\d{3,5}[A-Z]?)\b/i,
  );
  if (roomMatch) {
    const room = findRoom(`${roomMatch[1]} ${roomMatch[2]}`);
    if (room)
      return {
        locationId: room.id,
        building: room.building,
        label: room.name,
        point: room.point,
        confidence: "room",
        reason: room.description.includes("Unverified")
          ? "Room identifier inferred; confirm signage"
          : "Room identifier resolved; check geometry coverage",
      };
  }
  for (const [alias, id] of Object.entries(nicknames).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (
      new RegExp(
        `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(lower)
    ) {
      const b = buildingById[id];
      if (!b) continue;
      const number = text.match(
        /(?:room|hall\s*[-–]|lab\s*[-–])\s*[:#]?\s*(\d{3,5}[A-Z]?)/i,
      );
      const room = number ? findRoom(`${id} ${number[1]}`) : undefined;
      if (room)
        return {
          locationId: room.id,
          building: id,
          label: room.name,
          point: room.point,
          confidence: "room",
          reason: "Building alias and room number resolved",
        };
      return {
        locationId: id,
        building: id,
        label: b.shortName,
        point: b.center,
        confidence: "building",
        reason: "Known Waterloo building name or nickname",
      };
    }
  }
  for (const b of buildings) {
    const roomHint = text.match(/\b(?:Room|Rm)\s*[:#]?\s*(\d{3,5}[A-Z]?)/i);
    if (roomHint && new RegExp(`\\b${b.id}\\b`, "i").test(text)) {
      const room = findRoom(`${b.id} ${roomHint[1]}`);
      if (room)
        return {
          locationId: room.id,
          building: b.id,
          label: room.name,
          point: room.point,
          confidence: "room",
          reason: "Building and room field resolved",
        };
    }
    if (
      new RegExp(`\\b${b.id}\\b`, "i").test(text) ||
      lower.includes(b.name.toLowerCase()) ||
      lower.includes(b.shortName.toLowerCase())
    )
      return {
        locationId: b.id,
        building: b.id,
        label: b.shortName,
        point: b.center,
        confidence: "building",
        reason: "Campus building matched",
      };
  }
  if (
    /(?:university of waterloo|uw campus|uwaterloo|200 university avenue west)/i.test(
      text,
    )
  )
    return {
      locationId: "",
      building: "",
      label: "UW campus · venue to be confirmed",
      point: project(43.47165, -80.5437),
      confidence: "campus",
      reason: "Campus confirmed; exact venue not published",
    };
  return;
}
export function reconcileEvents(
  events: CampusEvent[],
  options: { personal?: boolean; now?: Date; days?: number } = {},
): {
  events: CampusEvent[];
  unresolved: CampusEvent[];
  excluded: number;
  duplicates: number;
} {
  const now = options.now || new Date(),
    cutoff = now.getTime() + (options.days || 30) * 86400000;
  const accepted: CampusEvent[] = [],
    unresolved: CampusEvent[] = [];
  let excluded = 0,
    duplicates = 0;
  for (const event of events) {
    if (
      event.cancelled ||
      !Number.isFinite(Date.parse(event.start)) ||
      !Number.isFinite(Date.parse(event.end)) ||
      Date.parse(event.end) <= now.getTime() - 86400000 ||
      Date.parse(event.start) > cutoff
    ) {
      excluded++;
      continue;
    }
    const location =
      event.location || resolveCampusLocation(event.locationText);
    const e = { ...event, location };
    if (!location) {
      if (options.personal) unresolved.push(e);
      else excluded++;
      continue;
    }
    const title = event.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      accepted.some(
        (a) =>
          a.id === e.id ||
          (a.title.toLowerCase().replace(/[^a-z0-9]/g, "") === title &&
            Math.abs(Date.parse(a.start) - Date.parse(e.start)) < 15 * 60000 &&
            a.location?.building === location.building),
      )
    ) {
      duplicates++;
      continue;
    }
    accepted.push(e);
  }
  return {
    events: accepted.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    unresolved,
    excluded,
    duplicates,
  };
}
export function resolveLocationId(id: string) {
  const location = resolveLocation(id);
  if (location) return location;
  const match = id.match(/^room-([A-Z0-9]+)-(\d+[A-Z]?)$/);
  if (match) {
    findRoom(`${match[1]} ${match[2]}`);
    return resolveLocation(id);
  }
  return null;
}
