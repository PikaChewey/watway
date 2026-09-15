import { load } from "cheerio";
import type {
  CampusEvent,
  CampusFeed,
  FacilityReading,
  SourceStatus,
} from "../src/intelligence/types";
const UA = "WatWay/0.2 (public campus navigation prototype)";
async function get(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": UA },
  });
  if (!r.ok) throw Error(`Source returned ${r.status}`);
  return r.text();
}
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export function parseOccupancy(
  html: string,
  at = new Date().toISOString(),
): FacilityReading[] {
  const $ = load(html),
    out: FacilityReading[] = [];
  $(".occupancy-card").each((i, el) => {
    const card = $(el),
      name = clean(card.find("h2").text()),
      chart = card.find("canvas[data-ratio]").first();
    const ratio = Number(chart.attr("data-ratio"));
    if (
      !name ||
      !chart.length ||
      !Number.isFinite(ratio) ||
      ratio < 0 ||
      ratio > 1
    )
      return;
    const capacity =
      Number(card.find(".max-occupancy strong").first().text().trim()) ||
      undefined;
    out.push({
      id: chart.attr("id") || name,
      name,
      building: /CIF/i.test(name) ? "CIF" : "PAC",
      percent: Math.round(ratio * 100),
      capacity,
      count: capacity ? Math.round(capacity * ratio) : undefined,
      updatedAt: at,
      status: "live",
      source: "https://warrior.uwaterloo.ca/FacilityOccupancy",
    });
  });
  return out;
}
export function parseWygo(html: string): CampusEvent[] {
  const $ = load(html),
    events = new Map<string, CampusEvent>();
  const visit = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (v.start_datetime && v.name) {
      const slug = v.slug || v.url_slug || v.id;
      const start = v.start_datetime,
        end = v.end_datetime;
      if (!Number.isFinite(Date.parse(start))) return;
      events.set(String(v.id || slug || v.name + start), {
        id: `wygo-${v.id || slug}`,
        title: v.name,
        start,
        end: end || new Date(Date.parse(start) + 7200000).toISOString(),
        locationText: [v.venue_name, v.address, v.city]
          .filter(Boolean)
          .join(", "),
        source: "WYGO",
        url: slug ? `https://wygo.world/${slug}` : "https://wygo.world/o/wygo",
        updatedAt: new Date().toISOString(),
      });
    }
    for (const x of Object.values(v)) if (typeof x === "object") visit(x);
  };
  $("script").each((i, e) => {
    const text = $(e).text();
    if (!text.includes("__next_f.push")) return;
    for (const match of text.matchAll(
      /self\.__next_f\.push\((\[[\s\S]*?\])\)/g,
    )) {
      try {
        const chunk = JSON.parse(match[1])[1];
        if (typeof chunk !== "string") continue;
        for (const line of chunk.split("\n")) {
          const sep = line.indexOf(":");
          if (sep < 0) continue;
          try {
            visit(JSON.parse(line.slice(sep + 1)));
          } catch {}
        }
      } catch {}
    }
  });
  return [...events.values()];
}
export function parseStructuredEvent(
  html: string,
  url: string,
  source: CampusEvent["source"],
): CampusEvent[] {
  const $ = load(html),
    events: CampusEvent[] = [];
  const visit = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (
      (v["@type"] === "Event" || String(v["@type"]).includes("Event")) &&
      v.startDate &&
      v.name
    ) {
      const location =
        typeof v.location === "string"
          ? v.location
          : [
              v.location?.name,
              typeof v.location?.address === "string"
                ? v.location.address
                : v.location?.address?.streetAddress,
              v.location?.address?.addressLocality,
            ]
              .filter(Boolean)
              .join(", ");
      events.push({
        id: `${source}-${v["@id"] || v.url || v.name + "-" + v.startDate}`,
        title: v.name,
        start: v.startDate,
        end:
          v.endDate ||
          new Date(Date.parse(v.startDate) + 7200000).toISOString(),
        locationText: location,
        source,
        url: v.url || url,
        updatedAt: new Date().toISOString(),
      });
    }
    for (const x of Object.values(v)) if (typeof x === "object") visit(x);
  };
  $('script[type="application/ld+json"]').each((i, e) => {
    try {
      visit(JSON.parse($(e).text()));
    } catch {}
  });
  return events;
}
export function parseUWEvent(html: string, url: string): CampusEvent[] {
  const $ = load(html),
    structured = parseStructuredEvent(html, url, "UW");
  if (structured.length) return structured;
  const title = clean($("h1").first().text());
  const main = $("main");
  const text = clean(main.text());
  const dateMatches = [
    ...text.matchAll(
      /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})\s+(\d{1,2}:\d{2})\s*(am|pm)\s*[-–]\s*(\d{1,2}:\d{2})\s*(am|pm)/g,
    ),
  ];
  const location =
    clean(
      main
        .find('[class*="address"],.field--name-field-uw-event-location')
        .text(),
    ) ||
    text
      .match(
        /(?:Location|Where:)\s+(.+?)(?:LEARN MORE|Additional Information|Event website|Cost|Host|Event category|Registration|Contact|$)/,
      )?.[1]
      ?.slice(0, 400) ||
    "";
  return dateMatches.slice(0, 12).map((m, i) => {
    const base = m[1].replace(",", "");
    const start = new Date(`${base} ${m[2]} ${m[3]} GMT-0400`),
      end = new Date(`${base} ${m[4]} ${m[5]} GMT-0400`);
    return {
      id: `uw-${url}-${i}`,
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      locationText: location,
      source: "UW" as const,
      url,
      updatedAt: new Date().toISOString(),
    };
  });
}
let cached: CampusFeed | undefined;
let inFlight: Promise<CampusFeed> | undefined;
export async function campusFeed(): Promise<CampusFeed> {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 120000)
    return cached;
  if (inFlight) return inFlight;
  inFlight = loadFeed().finally(() => (inFlight = undefined));
  return inFlight;
}
async function loadFeed(): Promise<CampusFeed> {
  const statuses: SourceStatus[] = [],
    events: CampusEvent[] = [],
    facilities: FacilityReading[] = [];
  await Promise.allSettled([
    (async () => {
      const url = "https://warrior.uwaterloo.ca/FacilityOccupancy";
      try {
        const rows = parseOccupancy(await get(url));
        if (!rows.length) throw Error("No occupancy data published");
        facilities.push(...rows);
        statuses.push({
          id: "athletics",
          name: "Warrior Athletics",
          status: "live",
          updatedAt: new Date().toISOString(),
          detail: "Published facility occupancy; refreshes every two minutes",
          url,
        });
      } catch {
        facilities.push(
          ...(cached?.facilities || []).map((r) => ({
            ...r,
            status: "cached" as const,
          })),
        );
        statuses.push({
          id: "athletics",
          name: "Warrior Athletics",
          status: cached?.facilities.length ? "cached" : "unavailable",
          detail: "Live occupancy could not be refreshed",
          url,
        });
      }
    })(),
    (async () => {
      const url = "https://luma.com/waterlootechweek";
      try {
        const rows = parseStructuredEvent(await get(url), url, "Luma");
        events.push(...rows);
        statuses.push({
          id: "luma",
          name: "Luma · Waterloo Tech Week",
          status: rows.length ? "live" : "unavailable",
          updatedAt: new Date().toISOString(),
          detail: "Public calendar; off-campus venues filtered",
          url,
        });
      } catch {
        statuses.push({
          id: "luma",
          name: "Luma",
          status: "unavailable",
          detail: "Public event calendar temporarily unavailable",
          url,
        });
      }
    })(),
    (async () => {
      const url = "https://wygo.world/o/wygo";
      try {
        const rows = parseWygo(await get(url));
        events.push(...rows);
        statuses.push({
          id: "wygo",
          name: "WYGO World",
          status: rows.length ? "live" : "unavailable",
          updatedAt: new Date().toISOString(),
          detail: `${rows.length} public listings read; campus filter applied in app`,
          url,
        });
      } catch {
        statuses.push({
          id: "wygo",
          name: "WYGO World",
          status: "unavailable",
          detail: "Public listings temporarily unavailable",
          url,
        });
      }
    })(),
    (async () => {
      const url = "https://uwaterloo.ca/events";
      try {
        const html = await get(url),
          $ = load(html);
        const links = [
          ...new Set(
            $('a[href^="/events/events/"]')
              .map((i, e) => $(e).attr("href")!)
              .get(),
          ),
        ].slice(0, 10);
        const rows = await Promise.allSettled(
          links.map(async (p) =>
            parseUWEvent(await get(new URL(p, url).href), new URL(p, url).href),
          ),
        );
        for (const r of rows)
          if (r.status === "fulfilled") events.push(...r.value);
        statuses.push({
          id: "uw",
          name: "Waterloo Events",
          status: "live",
          updatedAt: new Date().toISOString(),
          detail: "Public university event pages",
          url,
        });
      } catch {
        statuses.push({
          id: "uw",
          name: "Waterloo Events",
          status: "unavailable",
          detail: "University event feed temporarily unavailable",
          url,
        });
      }
    })(),
  ]);
  const fetchedAt = new Date().toISOString();
  cached = { events, facilities, sources: statuses, fetchedAt };
  return cached;
}
const allowedEventHosts = new Set([
  "lu.ma",
  "luma.com",
  "partiful.com",
  "www.partiful.com",
  "wygo.world",
]);
export async function importPublicEvent(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !allowedEventHosts.has(url.hostname) ||
    url.username ||
    url.password
  )
    throw Error("Use a public Luma, Partiful, or WYGO event link.");
  let response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status >= 300 && response.status < 400) {
    const next = new URL(response.headers.get("location") || "", url);
    if (next.protocol !== "https:" || !allowedEventHosts.has(next.hostname))
      throw Error("Unsupported event redirect");
    response = await fetch(next, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  }
  if (!response.ok) throw Error("This public event could not be read.");
  const html = (await response.text()).slice(0, 3000000);
  const source = url.hostname.includes("partiful")
    ? "Partiful"
    : url.hostname.includes("wygo")
      ? "WYGO"
      : "Luma";
  let events = parseStructuredEvent(html, value, source);
  if (source === "WYGO" && !events.length) events = parseWygo(html);
  if (!events.length)
    throw Error(
      "No public event details found. Import its calendar file instead.",
    );
  return { events };
}
