import type { CampusFeed, CampusEvent } from "./types";
import { resolveCampusLocation } from "./locations";

// Deliberately repeatable demo programming, based on public campus listings.
// These times illustrate a student day; they are not a live event schedule.
const program = [
  {
    title: "Community fruit & veg market",
    venue: "SLC Marketplace",
    hour: 11,
    duration: 4,
    source: "UW",
    url: "https://uwaterloo.ca/events/events/community-well-being-fruits-and-veg-market",
  },
  {
    title: "Velocity student start-up panel",
    venue: "South Campus Hall",
    hour: 14,
    duration: 1.5,
    source: "Luma",
    url: "https://luma.com/xnbiudsr",
  },
  {
    title: "Writing café",
    venue: "SCH 228F",
    hour: 15,
    duration: 2,
    source: "UW",
    url: "https://uwaterloo.ca/events/events/black-indigenous-and-racialized-students-writing-cafe-1",
  },
  {
    title: "A peek inside quantum computing",
    venue: "QNC",
    hour: 17,
    duration: 1,
    source: "Luma",
    url: "https://wygo.world/a-peek-inside-iqc",
  },
  {
    title: "Locked-in: Liminal Coworking",
    venue: "RCH 108",
    hour: 20,
    duration: 3,
    source: "WYGO",
    url: "https://wygo.world/liminal-coworking",
  },
] as const;
export function createDemoFeed(now = new Date()): CampusFeed {
  const events: CampusEvent[] = [];
  for (let day = 0; day < 7; day++)
    for (const [index, item] of program.entries()) {
      const start = new Date(now);
      start.setDate(now.getDate() + day);
      start.setHours(item.hour, 0, 0, 0);
      const end = new Date(start.getTime() + item.duration * 3600000);
      events.push({
        id: `demo-event-${start.toISOString().slice(0, 10)}-${index}`,
        title: item.title,
        start: start.toISOString(),
        end: end.toISOString(),
        locationText: item.venue,
        location: resolveCampusLocation(item.venue),
        source: item.source,
        url: item.url,
        demo: true,
      });
    }
  const updatedAt = now.toISOString();
  const facilities = [
    {
      id: "demo-cif",
      name: "CIF Fitness Centre",
      building: "CIF",
      percent: 32,
      capacity: 100,
    },
    {
      id: "demo-pac-weights",
      name: "PAC · Free Weights",
      building: "PAC",
      percent: 68,
      capacity: 75,
    },
    {
      id: "demo-pac-cardio",
      name: "PAC · Cardio",
      building: "PAC",
      percent: 24,
      capacity: 50,
    },
    {
      id: "demo-pac-machines",
      name: "PAC · Weight Machines",
      building: "PAC",
      percent: 56,
      capacity: 40,
    },
  ];
  return {
    mode: "demo",
    events,
    facilities: facilities.map((f) => ({
      ...f,
      status: "demo",
      updatedAt,
      source: "https://warrior.uwaterloo.ca/FacilityOccupancy",
    })),
    fetchedAt: updatedAt,
    sources: [
      {
        id: "demo",
        name: "Curated Waterloo demo",
        status: "demo",
        detail:
          "Built-in events and example gym activity. Event times repeat for the demo; original source links are retained.",
        url: "https://github.com/PikaChewey/looroute",
      },
    ],
  };
}
