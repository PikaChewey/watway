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
