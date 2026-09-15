# Data sources

Public source data was retrieved on September 15, 2026.

- **Campus building names and coordinates:** [University of Waterloo public Buildings dataset](https://github.com/uwaterloo/Datasets/blob/master/Buildings/Buildings.json).
- **Building footprints, roads, paths, and mapped Davis interiors:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). OpenStreetMap data is available under the Open Database License. The derived map datasets are in `src/data/map.json`, `src/data/indoor.json`, and the footprint fields of `src/data/buildings.json`.
- **MC floor 2 and floor 3 reference images:** [Math Faculty Computing Facility — Location and maps](https://uwaterloo.ca/math-faculty-computing-facility/about/location-and-maps).
- **MC floor 6 reference PDF:** [Public university-hosted floor plan](https://cs.uwaterloo.ca/~bwbecker/MC_06FLR.pdf), plan dated May 2023.
- **Accessibility descriptions:** [University of Waterloo building accessibility directory](https://uwaterloo.ca/accessibility/catalogs/building-accessibility).
- **Removed math bridges / M4 construction:** [Waterloo News — WAT connects us](https://uwaterloo.ca/news/mathematics/wat-connects-us), December 18, 2025. This newer update takes precedence over older accessibility pages that still describe the removed bridges.
- **Study-space information:** [University libraries — Study](https://uwaterloo.ca/lib/study).
- **Food reference:** [Food Services locations and hours](https://uwaterloo.ca/food-services/locations-and-hours).
- **Weather:** [Open-Meteo](https://open-meteo.com/). The live weather request is made from the browser. Unavailable requests fall back to cached or sample conditions and are labelled accordingly.
- **Optional semantic model:** [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), loaded through Transformers.js when enabled.

Public reference plans retain their original copyright and are not relicensed as application code. Map geometry is community-maintained and is not a current engineering survey. The app distinguishes mapped interiors from schematic coverage, and estimates from live weather.

## Proactive campus update

- **WATIsGrass:** [Ricky Qin and contributors](https://github.com/rickyqin005/WATIsGrass), community hallway/bridge/tunnel geometry. The source dataset and original GPL-3.0 license are retained in `public/data/watisgrass/`; the source copy used by the renderer is `src/data/watisgrass.json`. WatWay adds closure exclusions and labels approximate connections.
- **Published fitness occupancy:** [Warrior Athletics Facility Occupancy](https://warrior.uwaterloo.ca/FacilityOccupancy). Read server-side and cached for two minutes; displayed timestamps indicate retrieval time, not an independent sensor measurement.
- **University events:** [Waterloo Events](https://uwaterloo.ca/events), using public event detail pages. Page footers are excluded from location extraction.
- **WYGO:** [Public WYGO event calendar](https://wygo.world/o/wygo).
- **Luma:** [Public Waterloo Tech Week calendar](https://luma.com/waterlootechweek). Individual listings may point to their original event-hosting provider.
- **Google Calendar:** User-authorized read-only Calendar API access through Google Identity Services. Access tokens remain in memory; personal event data is not committed or included in the public snapshots.

Event title, time, and venue are reconciled across sources. Off-campus, expired, and unresolved public events are filtered. Explicitly announced UW events with a venue still pending can appear as campus-level events but cannot be routed until a location is known. Public event links can also be imported from Luma, Partiful, and WYGO when metadata is available. Private pages are not bypassed.

## Physical campus and residence geometry

The visual campus was extended with public OpenStreetMap geometry for REV, UW Place, Village 1, Mackenzie King Village, Columbia Lake Village North/South, and residence buildings. Some building codes share one continuous footprint; aliases retain those names without duplicating the geometry. The building catalog now contains 136 distinct entries. Building sub-parts preserve mapped footprint changes and level counts where available.

The walkable tunnel paths and stairwell locations come from WATIsGrass. Stair flights, tread dimensions, switchback orientation, railings, and corridor wall heights are reconstructions at those mapped positions, not surveyed interior architecture. Free walking samples these surfaces for vertical movement. Exact access and interior geometry still need verification.

Satellite and terrain views optionally request Esri basemap tiles, with attribution shown in the interface. Campus 3D uses the mapped geometry directly and does not require those imagery requests. Esri imagery credits: Esri, Vantor, Earthstar Geographics, and the GIS User Community.

## Physical navigation reference images

- `public/references/sch-al-tunnel.jpeg`: University of Waterloo photograph of the yellow/orange arts tunnel, from https://uwaterloo.ca/news/mathematics/wat-connects-us .
- `public/references/slc-1120.jpg`: University of Waterloo SLC 1120 doorway photograph, from https://uwaterloo.ca/student-life-centre/inside-student-life-centre/slc-spaces .

Photographs retain their original copyright. They are visual references, not evidence of surveyed geometry. MC 4020's room identity is supported by https://uwaterloo.ca/math/events/stress-muo-trivia-night ; its exact doorway position in this prototype is inferred. Public MC third-floor plans and mapped fourth-floor corridor lines inform the reconstruction, with explicit uncertainty retained.
