# WATWay

A 3D University of Waterloo campus navigator with mapped indoor spaces, route planning, weather, and local semantic AI.

## Run locally

Use Node.js 22 or newer and npm.

```bash
git clone https://github.com/PikaChewey/looroute.git
cd looroute
npm ci
npm run dev
```

Open **http://localhost:5173/**. No API keys or environment variables are required. Port 5173 must be available.

```bash
npm test        # Routing, accessibility preference, search, and collision checks
npm run build  # TypeScript validation and production bundle
npm run preview
```

## Try these flows

- **Explore indoors → Walk:** enter the mapped Davis Centre ground floor. **WASD** moves, **drag** looks, **Shift** runs, and **M** toggles the map. **Follow** is the third-person camera. Keys **1 / 2 / 3** select map / follow / walk.
- Search **DC 1350**, select Directions, and compare Fastest, Shortest, Most indoor, Step-free, Least stairs, and Weather-smart.
- **Preview walk** simulates a trip and transitions into building interiors. It is not GPS guidance.
- **Ask WAT:** try “Find a quiet study space with outlets within 5 minutes of my next class.” Enable the local AI model for semantic matching. Its first download requires internet; structured search works without it.
- **My day:** replace the sample schedule, select weekdays, and add your classes. Leave-by times include a three-minute buffer. Schedules and saved places stay in this browser's local storage; they are not shared between teammates.
- The weather menu fetches Open-Meteo conditions and offers simulated rain, snow, sun, and fog. Layers includes seasons and night mode.

## Coverage and accuracy

- **56 campus buildings**, with locations from Waterloo's public building dataset.
- Campus footprints and paths from OpenStreetMap.
- **128 mapped Davis ground-floor spaces**, with room outlines, doors, collision walls, and a walkable routing graph.
- Public MC floor plans for floors 2, 3, and 6, available from the building panel.
- Other interiors, some entrances, vertical circulation, and indoor connections remain partial or schematic.
- Heights, travel times, congestion, and elevator waits are estimates. Opening hours, lift status, room availability, and temporary closures are not live verified feeds.
- Removed MC–DC and MC–M3 bridges are excluded. Follow campus signs around construction.

The in-app **Data & accuracy** panel includes sources and limitations. WATWay is an independent prototype, not an official university service.

## Project structure

| Location | Purpose |
| --- | --- |
| `src/App.tsx` | Search, directions, schedule, assistant, and interface |
| `src/ThreeMap.tsx` | Three.js scene, cameras, movement, and visualization |
| `src/routing.ts` | Navigation graph, route preferences, and directions |
| `src/indoor.ts` | Mapped Davis geometry, wall collisions, and room ingestion |
| `src/data/` | Checked-in campus geography and semantic place catalog |
| `src/semantic.ts` | Grounded intent parsing and campus recommendations |
| `src/semantic.worker.ts` | Optional local embedding model in a Web Worker |
| `src/weather.ts` | Open-Meteo integration and fallback handling |
| `src/routing.test.ts` | Core navigation checks |
| `public/floorplans/` | Public university reference plans |
| `scripts/prepare-data.py` | Optional ingestion script; requires downloaded source files in `work/` |

The checked-in data is sufficient to run the app. Data ingestion is not part of startup. The scene is a view of the campus model; it is not the routing source of truth.

## Working together

Create a feature branch, run the checks above, and open a pull request. Keep data provenance explicit when replacing schematic geometry with better measurements or plans. Do not commit credentials, local schedules, generated builds, or `node_modules`.

See [DATA-SOURCES.md](DATA-SOURCES.md) for provenance. Third-party data and reference plans retain their original terms.
