# WATWay UI direction

The primary screen answers two questions: where am I going, and how do I get there?

- A neutral, light sidebar beside the campus map. System fonts, thin dividers, one dark action colour.
- One next-stop card with the room, class time, departure time, indoor share and Directions action.
- Three place shortcuts. Calendar and campus activity have their own navigation destinations.
- Demo playback, chapter selection and algorithm controls live under a closed disclosure. The header continues to identify the sample day as a demo.
- Camera tools open on demand; map appearance stays separate from navigation.
- Phone sheets leave the map visible and expand for place details or directions. Compact phones keep the Directions action in view.
- Building lists show a code and name; floor information remains available in place details. Route preferences use one labelled select.

## References checked

- [21st.dev Dashboard Sidebar](https://21st.dev/@arunjdass/components/dashboard-sidebar): inspected the component; Copy required sign-in, so no prompt or source was retrieved.
- [React Bits Fade Content](https://reactbits.dev/animations/fade-content): the plain mount-fade behavior is adapted in `src/ui/FadeContent.tsx` with a short native CSS animation. Reduced-motion preferences disable it. No animation package was added.
- [Google Maps](https://www.google.com/maps) and [Linear](https://linear.app): references for a map beside a functional sidebar and restrained navigation.

## Reusable editing prompt

> Edit the existing WATWay frontend. Make finding a campus destination and starting directions the primary workflow. Use a light neutral sidebar, system typography, subtle borders and a single dark action colour. Keep the overview to one next-stop card and three place shortcuts. Move sample-day playback, scene selection and technical demonstrations into a closed disclosure. Put camera tools behind an explicit control. Remove repeated metadata and decorative copy. Preserve routing, calendar, search, map layers, accessibility preferences and demo access. Verify desktop, 390×844 and 320×667 phone layouts; the next-stop Directions action must fit without scrolling. Respect reduced motion and preserve clear demo/provenance labels.

## Validation

- All 38 existing tests pass.
- TypeScript and the Vite production build pass.
- Browser checks cover search → place details, route preferences, campus listings, the sample week, map settings, camera controls and access to the algorithm panel.
