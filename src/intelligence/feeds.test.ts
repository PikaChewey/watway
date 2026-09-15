import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseOccupancy,
  parseStructuredEvent,
  parseUWEvent,
  importPublicEvent,
} from "../../server/feeds";
test("published facility occupancy is parsed without reading hidden error banners", () => {
  const html =
    '<div class="alert" hidden>Unavailable</div><div class="occupancy-card"><h2>CIF Fitness Centre</h2><canvas id="cif" data-ratio="0.42"></canvas><p class="max-occupancy"><strong>100</strong></p></div>';
  const rows = parseOccupancy(html, "2026-09-15T16:00:00Z");
  assert.equal(rows[0].percent, 42);
  assert.equal(rows[0].count, 42);
  assert.equal(rows[0].building, "CIF");
});
test("structured event calendar retains distinct event URLs", () => {
  const event = (id: string) => ({
    "@type": "Event",
    "@id": `https://luma.com/${id}`,
    url: `https://luma.com/${id}`,
    name: id,
    startDate: "2026-09-16T16:00:00Z",
    endDate: "2026-09-16T17:00:00Z",
    location: { name: "DC 1350" },
  });
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: [event("a"), event("b")] })}</script>`;
  const rows = parseStructuredEvent(html, "https://luma.com/calendar", "Luma");
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
});
test("university footer address cannot turn off-campus events into campus events", () => {
  const html =
    '<main><h1>Meetup</h1>Tuesday, September 15, 2026 3:00 pm - 5:00 pm Location Toronto</main><footer class="uw-footer-address">200 University Avenue West</footer>';
  const result = parseUWEvent(html, "https://uwaterloo.ca/events/test");
  assert.equal(result[0].locationText, "Toronto");
});
test("event importer rejects non-provider URLs before any network call", async () => {
  await assert.rejects(importPublicEvent("http://127.0.0.1/private"));
  await assert.rejects(importPublicEvent("https://example.com/event"));
});
