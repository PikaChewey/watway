import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCampusLocation, reconcileEvents } from "./locations";
import { importCalendarFile } from "./calendar";
import { buildingMinCut, estimatedClassBurst } from "./state";
import type { CampusEvent } from "./types";
const now = new Date("2026-09-15T12:00:00-04:00");
test("resolves Waterloo nicknames and old engineering name", () => {
  assert.equal(resolveCampusLocation("E7 3343")?.building, "PSE");
  assert.equal(
    resolveCampusLocation("Helix Lab (Rod Coutts Hall - 108), Waterloo")
      ?.building,
    "RCH",
  );
  assert.equal(resolveCampusLocation("Davis Centre")?.building, "DC");
});
test("off-campus and ambiguous events do not appear on the map", () => {
  for (const x of [
    "Builders Club, 165 King St W, Kitchener",
    "Waterloo Town Square",
    "MYSTERY to be revealed",
    "University of Waterloo speaker at Toronto",
  ])
    assert.equal(resolveCampusLocation(x), undefined);
  assert.equal(resolveCampusLocation("TBD (UW Campus)")?.confidence, "campus");
});
test("events reconcile across providers by title time and campus venue", () => {
  const base: CampusEvent = {
    id: "1",
    title: "Study Jam",
    start: "2026-09-16T16:00:00Z",
    end: "2026-09-16T17:00:00Z",
    locationText: "DC 1350",
    source: "WYGO",
  };
  const r = reconcileEvents(
    [
      base,
      { ...base, id: "2", source: "Luma" },
      { ...base, id: "3", locationText: "Toronto" },
    ],
    { now },
  );
  assert.equal(r.events.length, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.excluded, 1);
});
test("ICS weekly recurrence and exclusions are expanded", () => {
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-class\r\nDTSTART:20260915T160000Z\r\nDTEND:20260915T170000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4\r\nEXDATE:20260917T160000Z\r\nSUMMARY:CS 135\r\nLOCATION:DC 1350\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const r = importCalendarFile(ics, now);
  assert.equal(r.events.length, 3);
  assert.ok(r.events.every((e) => e.location?.building === "DC"));
  assert.ok(!r.events.some((e) => e.start === "2026-09-17T16:00:00.000Z"));
});
test("calendar retains unresolved personal events for user review", () => {
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:x\nDTSTART:20260916T160000Z\nDTEND:20260916T170000Z\nSUMMARY:Team meeting\nLOCATION:Somewhere\nEND:VEVENT\nEND:VCALENDAR`;
  const r = importCalendarFile(ics, now);
  assert.equal(r.events.length, 0);
  assert.equal(r.unresolved.length, 1);
});
test("class-change prediction responds to time", () => {
  assert.ok(
    estimatedClassBurst(new Date("2026-09-15T12:55:00-04:00")) >
      estimatedClassBurst(new Date("2026-09-15T12:40:00-04:00")),
  );
});
test("coarse max-flow / min-cut obeys a bottleneck", () => {
  const result = buildingMinCut("A", "C", [
    { from: "A", to: "B", capacity: 10 },
    { from: "B", to: "C", capacity: 4 },
  ]);
  assert.equal(result.capacity, 4);
  assert.equal(result.cut.length, 1);
});
test("mixed timezone timestamps sort chronologically", () => {
  const event = (id: string, start: string): CampusEvent => ({
    id,
    title: id,
    start,
    end: new Date(Date.parse(start) + 3600000).toISOString(),
    locationText: "DC",
    source: "UW",
  });
  const result = reconcileEvents(
    [
      event("later", "2026-09-16T16:00:00-04:00"),
      event("earlier", "2026-09-16T19:00:00Z"),
    ],
    { now },
  );
  assert.equal(result.events[0].id, "earlier");
});

import { createDemoFeed } from "./demo";
test("demo data is immediate, labelled, and resolves to real campus places", () => {
  const feed = createDemoFeed(new Date("2030-04-06T12:00:00Z"));
  assert.equal(feed.mode, "demo");
  assert.equal(feed.events.length, 35);
  assert.ok(feed.events.every((e) => e.demo && e.location?.locationId));
  assert.ok(feed.facilities.every((f) => f.status === "demo"));
  assert.ok(
    feed.events.some(
      (e) => Date.parse(e.start) > Date.parse("2030-04-06T12:00:00Z"),
    ),
  );
});
