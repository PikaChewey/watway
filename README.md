# WATWay

A mobile-first University of Waterloo campus companion: 3D navigation, proactive destination cards, calendar-aware routes, and live public campus information.

## Run

Node.js 22 or newer and npm are recommended.

```bash
git clone https://github.com/PikaChewey/looroute.git
cd looroute
npm ci
npm run dev
```

Open **http://localhost:5173/**. No paid services are required. Port 5173 must be available.

```bash
npm test
npm run build
npm run preview
```

The Vite development and preview servers include the campus feed API. A plain static host can show the cached public snapshot but cannot refresh the server-side feeds without hosting the API.

## Demo first

The app starts with a built-in class schedule, curated campus events, and example gym activity. No sign-in or campus-feed network request is needed. Demo event times repeat across the coming week and are labelled as illustrative; original listing links are retained. In **Campus**, choose **Try live sources** to opt into the existing live adapters. Google Calendar is under **My day → Optional calendar connection**.

## What works

- **For you:** upcoming destination, leave-by time, route exposure, and useful stops that fit gaps in your schedule. The initial classes are explicitly labelled samples.
- **Explore:** 56 buildings, campus amenities, mapped footprints, saved places, and semantic search. Longer searches can load a local embedding model; no conversational UI or external LLM calls.
- **My day:** recurring class entry, read-only Google Calendar integration, `.ics` import with recurrence and exceptions, and review of unresolved locations. Personal calendar data stays in this browser's local storage.
- **Campus:** ready-made demo events and activity, with optional published Warrior Rec occupancy and UW/WYGO/Luma public events, campus-only venue filtering, deduplication, and public Luma/Partiful/WYGO event-link import where details are available.
- **Time preview:** scrub through the day to change predicted activity, route costs, lighting, and available weather forecasts. Predictions are clearly differentiated from current source readings.
- **3D:** map, orbit, first-person, and third-person views; mapped Davis interior walls and doors; WATIsGrass bridge/tunnel geometry and partial hallway overlays; seasons, weather, day/night, simulated pedestrians and vehicles; adaptive and battery-saving quality modes.
- **Routes:** shortest/fastest/indoor/step-free/least-stairs/weather-aware preferences, mapped stair exclusions, modeled congestion costs, and animated walkthroughs.
- **Offline shell:** production builds register a service worker that caches visited app assets and public map data. Private API responses and Google Calendar requests are not cached by the service worker. Live updates require connectivity.

### Controls

**Go inside → Walk** enters an interior. **WASD** moves, **drag** looks, **Shift** runs, and **M** switches the map. **1 / 2 / 3** selects map / follow / walk. Mobile has touch movement controls and a collapsible bottom sheet. **⌘/Ctrl K** opens search.

## Google Calendar setup

The integration is implemented, but each installation needs a Google OAuth **Web application client ID** before real sign-in can succeed. This repository does not include one.

1. Enable Google Calendar API in your Google Cloud project and configure its consent screen.
2. Create a Web application OAuth client and add `http://localhost:5173` as an authorized JavaScript origin (and your actual deployed origin if applicable).
3. Set `VITE_GOOGLE_CLIENT_ID` in a local `.env` using `.env.example`, or enter the public client ID in the in-app connection setup.
4. In **My day**, choose **Connect Google** and grant read-only calendar/event access. Select the calendars to sync.

Access tokens stay in memory. Sync refreshes every five minutes while the app is visible and permission is valid. Google may require a reconnect when the token expires. Disconnect removes the imported Google events. `.ics` import works immediately without OAuth setup.

Calendar titles alone do not invent classroom assignments. Unresolved locations are shown for review; known Waterloo names, nicknames, building codes, and room fields are resolved locally. Private or hidden event venues are not guessed.

## Data and limits

The app uses public building coordinates, OpenStreetMap geometry, WATIsGrass community paths, public university floor-plan references, Open-Meteo, Warrior Athletics occupancy, Waterloo Events, WYGO, and Luma. Source freshness and provenance are shown in the app. Partiful ingestion requires a readable public event link or a calendar file; there is no private Partiful account integration.

Davis ground-floor room outlines and doors are mapped. Other interior coverage is partial, with schematic approaches and inferred heights. WATIsGrass path files retain their original GPL-3.0 license and attribution. Removed MC–DC and MC–M3 bridges are excluded.

Crowd flows use curated class-change demand assumptions, not a complete live university timetable. Link capacities, queue waits, and bottleneck calculations are estimates—not measured safety capacities. The graph includes a coarse max-flow/min-cut utility with tests. Actual door access, elevator operation, room availability, dining hours, and most temporary closures are not verified live. Follow campus signs.

See [DATA-SOURCES.md](DATA-SOURCES.md). WATWay is an independent prototype, not an official university service.

## Code

| Location | Purpose |
| --- | --- |
| `src/App.tsx`, `src/CalendarPanel.tsx` | Mobile-first UI, contextual cards, calendar flows |
| `src/ThreeMap.tsx` | Rendering, camera modes, movement, weather, scene activity |
| `src/routing.ts`, `src/indoor.ts` | Route graph, preferences, mapped interiors, collision walls |
| `src/intelligence/` | Calendar ingestion, venue resolution, reconciliation, state, flow estimates, tests |
| `server/feeds.ts`, `server/plugin.ts` | Cached public-feed adapters and Vite API middleware |
| `src/data/` | Campus model, geometry, and community path integration |
| `public/data/` | Public fallback snapshot and original licensed WATIsGrass dataset |
| `public/sw.js` | Production offline asset caching |

Use a feature branch for changes and run the tests and production build before opening a pull request. Never commit credentials or personal calendars. Generated builds, scratch files, `.env`, and `node_modules` are ignored.

## Physical-world update

The map now includes 136 campus/residence entries, including REV, UW Place, Village 1, MKV, and CLV blocks, plus mapped building sub-parts. **Campus 3D** prioritizes consistent geometry; **Satellite** and **Terrain** are optional contextual views.

Use **Walk a tunnel** or **Try stairs** to enter the mapped walking network. Stairs have actual step surfaces and landings; walking changes the player's height. W/S moves faster than A/D strafing, with normalized diagonal movement. Mapped stairwell positions and floor connections are used, but tread dimensions, stair orientation, and corridor construction remain approximations. This is not a surveyed indoor twin.
