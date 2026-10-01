# RealityQuorum — implementation progress

## Current phase

Campus UI foundation for **NMAM Institute of Technology**. Work started 1 October 2026 in this folder. `plan.md` is the product specification.

## Work log

### 1 October 2026 — project inspection

- Read the complete dual intake plan.
- Confirmed this is a new application: the existing files are `plan.md` and two campus videos in `videos-for-ui/`.
- Inspected both source videos: portrait footage (720 × 1280, about 42 seconds) and landscape footage (1280 × 720, about 71 seconds).
- Selected React + TypeScript + Vite for the interface, with Three.js / React Three Fiber for interactive campus geometry.
- Scope for this UI phase: campus explorer, clickable buildings, accessible location list, both intake forms, local case tracking, and clearly labelled example cases.
- The first campus model will be an interpretive model informed by the supplied footage. Building names and exact positions need campus confirmation; it must not be presented as a surveyed reconstruction.

### 1 October 2026 — first working UI

- Created the React/TypeScript/Vite app and installed Three.js, React Three Fiber, Drei and Lucide icons. Fonts are served locally (DM Sans and Manrope).
- Inspected contact sheets from both videos. Recognizable features: courtyard-style Ramanujan block, white/cream facades, pitched red roofs, solar panels, gardens, palms, incubation centre and sports grounds.
- Extracted five local reference stills and an eight-second silent, compressed campus flyover. Original source videos remain unchanged.
- Built a warm, light campus workspace: navigation, dual intake cards, map explorer, location details, prepared case examples and the shared verification journey.
- Implemented an interactive 3D scene with click-to-select buildings, orbit, zoom, reset and label visibility. Added aerial playback and an accessible searchable location list.
- Added both intake dialogs with editable category/urgency, location and landmark, optional attachments, food-specific details and review before saving. Direct reports work without an image.
- Added case browsing, evidence attachments, timeline, prepared predicate-level outcomes and the closure-evidence explanation.
- Added role-specific mission-policy previews, a moderated-public-update preview, campus search, preview settings and notification placeholder.
- Implemented local IndexedDB storage as the initial UI persistence adapter. Attachments stay with the case across reloads. Local-only limitations are stated in the interface.
- Added responsive layouts, native modal focus handling, keyboard focus styles, reduced-motion support and a location-list fallback for devices without WebGL.
- Consulted the official institution website for campus context. No third-party images were copied. Model positions are approximate, and unconfirmed locations are labelled provisional.
- Detected parallel backend development documented in `claude.md` and `claude progress.md`. Preserving those files, the server/shared code and the API proxy. This log covers the UI work; backend integration is being handled separately.

## In progress

- Confirming the one remaining ambiguous landmark: which mapped food building students call the Main Canteen.

## Pending verification

- Campus confirmation of exact building footprints, entrances and the Main Canteen name/location.

## Integration boundary

The frontend is connected to the local development API for demo accounts, private case creation, evidence and policy enforcement. Institutional sign-in, production-grade secure storage, live Gemini, issuer verification and external notifications still require deployment integration. Development data must not be described as institutional case storage or verified real-world findings.

### 1 October 2026 — satellite-aligned campus rebuild

- Inspected all seven new satellite captures in `videos-for-ui/` at original resolution and connected their overlapping coverage from the academic core through hostels, sports grounds, indoor stadium and Sanmathi Garden.
- Used Google Maps only as a visual and landmark cross-check; map imagery was not copied into the app. Confirmed relative positions for APJ/Admin, S. Ramanujan Block, Sambhram, NRAM Polytechnic, NMAMIT Hospital, Nitte Amphitheatre, Justice K. S. Hegde Institute of Management, AIC-Nitte, Kitchen Bells, hostel/mess, B. C. Alva Sports Complex, New NET Main Ground, B. C. Alva Memorial Indoor Stadium and Sanmathi Garden.
- Replaced the original seven-location interpretive layout with a 17-location satellite-aligned schematic. The scene now spans the actual academic, residential, sports and eastern garden corridors instead of placing every feature in one compact courtyard.
- Rebuilt the procedural landscape with multiple connected campus roads, denser tree cover, APJ solar panels, courtyard academic geometry, amphitheatre, hostel blocks, football pitch, oval New NET Main Ground, indoor stadium, café and Sanmathi Garden water feature.
- Added click targets for outdoor areas and kept every location available through the searchable, keyboard-accessible list.
- Added automatic label collision handling so the most important landmarks remain readable; a selected landmark always takes priority.
- Corrected the initial 3D camera framing and tested Reset, label selection and the APJ detail/report action in the live browser.
- The Main Canteen remains intentionally provisional because the supplied/map references show several food venues but do not establish which one students use under that exact name.
- Type checks and the production build pass after the rebuild. All 40 automated tests pass. The expected Three.js graphics chunk warning remains documented and the scene stays lazy-loaded.
- Rechecked the rebuilt map at a 375-pixel mobile viewport: it has no horizontal overflow, the campus remains legible, and automatic label collision reduces the mobile view to the most useful landmarks.
- Verified a newly mapped location end to end: Sanmathi Garden can be selected from the accessible location list and is carried into the working direct-report form as location ID `garden`.

### 1 October 2026 — main-block organization pass

- Kept the original visual layout after student review; the issue was map organization, not the overall page design.
- Reduced the selectable campus set from 17 map points to 13 main reporting destinations.
- Removed Sambhram, NRAM Polytechnic, Kitchen Bells and Sanmathi Cafe from the 3D scene, location list and report-location dropdown.
- Retained the important academic blocks, canteen, hostel, hospital, amphitheatre, management institute, major sports grounds, indoor stadium and Sanmathi Garden.
- Ordered locations by purpose: academic core, student services, then sports and outdoor spaces.
- Reduced procedural tree density by half and changed the default marker view to major landmarks only. The tag control still reveals additional main-block labels when needed.
- Restored the polished compass, legend and interaction hints from the earlier layout.
- Type checks, production build and all 40 automated tests pass after the simplification.

### 1 October 2026 — annotated academic-core correction and real media pass

- Used the student's annotated satellite image as the authority for the academic-core arrangement: APJ/Admin, S. Ramanujan, SMV and C. V. Raman form the four sides around SAC Open-Air Theatre, with the College Bus Stop beside the eastern access road.
- Added C. V. Raman Block, SAC Open-Air Theatre and College Bus Stop as selectable locations. Removed the management institute from the main selector because it is outside the requested core set. The final organized directory contains 15 main destinations.
- Created a detailed time-labelled contact sheet for the 71-second landscape campus video and extracted location-specific stills for Ramanujan, APJ, SMV, C. V. Raman, Atal Incubation Centre, Sanmathi Garden, B. C. Alva Sports and the hostel blocks.
- Created clearly labelled satellite-reference crops for SAC OAT, the bus stop, the hospital, the amphitheatre and the indoor stadium where a clean building view was not available in the video.
- Added a locally bundled facility photograph from the [official NMAMIT canteen page](https://nitte.edu.in/nmamit/canteen.php). The card labels it **Official NMAMIT reference** and keeps the canteen footprint provisional; it does not claim the photograph verifies the mapped exterior.
- Added source labels to location imagery so students can distinguish supplied-video stills, supplied satellite references and official web references.
- Verified the live location directory contains APJ, Ramanujan, SMV, C. V. Raman, SAC OAT and College Bus Stop, and does not contain Sambhram or the other removed secondary POIs.
- Final verification passes: TypeScript checks, production build and all 46 automated tests. Vite continues to report only the expected large Three.js graphics-chunk warning.

### 1 October 2026 — final campus declutter pass

- Removed NMAMIT Hospital from the model, directory and report-location choices.
- Removed the separate B. C. Alva Sports Complex / Football Ground entry to eliminate the duplicate ground.
- Renamed New NET Main Ground to **B. C. Alva Ground** while retaining the southern oval ground position and photograph.
- Reduced the default marker set from eleven labels to six high-value labels. All 13 remaining places are still available through the location list or the optional “show more labels” control.
- Reduced decorative tree density and allowed greenery to fill the two spaces left by the removed destinations, producing a calmer campus overview.
- Verified the live 3D view and location directory after the cleanup. TypeScript checks, the production build and all 46 automated tests pass.
