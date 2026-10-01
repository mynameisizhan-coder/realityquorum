# RealityQuorum

An evidence-led campus reporting workspace for **NMAM Institute of Technology**.

The current interface includes an interactive 3D campus, the supplied campus aerial footage, two independent intake routes, private development cases, attachments, case timelines and a demo-account switcher.

## Run locally

Requires Node.js 24 (the development API uses Node's built-in SQLite support).

```sh
npm install
npm run dev:all
```

Open **http://127.0.0.1:5173/**. The API listens on `127.0.0.1:8791`, and Vite forwards `/api` requests to it. If both services are already running, use the existing preview; do not start another copy on the same ports.

Alternatively, run `npm run dev` and `npm run dev:server` in two terminals. Keep both running to use the report forms and demo accounts.

```sh
npm run build
npm run typecheck
npm test
```

`npm run preview` alone serves the static production build; it does **not** proxy the API. For a production deployment, serve the frontend and `/api` under the same origin and replace development authentication first.

## Explore the UI

1. Orbit the 3D campus, then click a building or its label. Scroll to zoom; use Reset to restore the initial view.
2. Select **Aerial view** to play the compressed clip made from the supplied footage.
3. Use **Location list** for searchable, keyboard-accessible location selection.
4. **Report an issue** opens an observation form. A photograph is optional. Choosing Food & canteen reveals serving time, food item, receipt and handling context.
5. **Verify a message** accepts pasted content and attachments independently of direct reports.
6. Review category, urgency and location before creating a private development case.
7. Open **My cases** for the evidence ledger, response target, closure checklist and timeline. Add an attachment or a context note later.
8. Open the profile at the bottom of the navigation to switch between seeded demo accounts. The server scopes case access by the current account.

The category helper uses a labelled **mock Gemini adapter**, not a live Gemini connection. It does not perform image analysis. Students can override the suggestion.

## Campus model and media

- Source videos: `videos-for-ui/`. These have not been modified.
- Contact sheets: `reference/`.
- Application media: `public/media/`. Most building photographs and the silent eight-second flyover are derived from the supplied videos. Satellite-detail crops come from the user's supplied annotated/reference images. The Main Canteen card uses an official NMAMIT facility photograph because the supplied video does not establish a clear canteen exterior.
- Scene: `src/components/CampusScene.tsx`.
- Location metadata and satellite-aligned relative positions: `src/data/campus.ts`.
- The interface intentionally exposes 13 main reporting destinations. The annotated academic core contains APJ/Admin Block, S. Ramanujan Block, SMV Block, C. V. Raman Block and SAC Open-Air Theatre, with the College Bus Stop beside the access road. NMAMIT Hospital and the duplicate northern sports-ground entry are also omitted; the southern oval is labelled **B. C. Alva Ground**. Secondary map points such as Sambhram, NRAM Polytechnic, Kitchen Bells and Sanmathi Cafe remain excluded to keep the campus selector clear.
- Seven supplied satellite captures in `videos-for-ui/` were used as modeling references and are not redistributed in the interface.
- The model is a satellite-aligned schematic, **not** a surveyed digital twin or a navigation map. Relative landmark positions follow the supplied captures and a Google Maps cross-check; procedural footprints, heights, entrances and paths still need campus confirmation.
- The latest student-supplied campus layout sketch is the authority for the primary visual composition: Indoor Stadium, Sanmathi Garden and B. C. Alva Ground form the upper band; Atal, Canteen and SMV form the middle band; the Bus Stop sits upper-right; C. V. Raman, Ramanujan and APJ step down toward the lower-right; and the Amphitheatre anchors the lower-left.
- Main Canteen remains explicitly provisional because the references show multiple food facilities without establishing which footprint students call the Main Canteen. Its card uses a locally bundled image from the [official NMAMIT canteen page](https://nitte.edu.in/nmamit/canteen.php); the interface labels it as an official reference rather than a verified exterior/location match.
- The [official NMAMIT site](https://nitte.edu.in/nmamit/index.php), [official contact page](https://nitte.edu.in/nmamit/contact-nmamit.php) and [Google Maps campus listing](https://www.google.com/maps/place/Nitte+Mahalinga+Adyantaya+Memorial+Institute+of+Technology+-+NMAMIT/) were consulted for campus context. No third-party map imagery is bundled.

## Implementation boundaries

The backend and domain engine were added separately during this UI build. The UI now uses their server-backed case store and preserves that work. See `claude.md` for the API contract and `claude progress.md` for backend verification.

Connected in this UI: demo sessions, scoped case listing, both submissions, category suggestions, private attachment retrieval, evidence updates and case tracking.

Still pending in the UI: mission acceptance/submission screens, operator approval controls, department actions and publication controls. The mission page currently explains approved policies, and the public-update page shows clearly labelled example wording. Their backend endpoints exist but the corresponding action interfaces are not finished.

Institutional sign-in, live Gemini, real issuer verification, external notifications and production deployment remain pending. Do not use real sensitive reports in the development demo; its accounts can be freely switched.

## Structure

```text
src/
  App.tsx                   Navigation, views and demo-account state
  components/
    CampusExplorer.tsx      3D / aerial / accessible-list controls
    CampusScene.tsx         Procedural campus geometry and camera
    IntakeDialog.tsx        Both submission routes and review step
    CaseDialog.tsx          Evidence, timeline and response tracking
    Dialog.tsx              Native modal with keyboard dismissal
  data/                     Campus metadata and static example fallback
  api/                      Typed server adapter and data hooks
  lib/                      Shared UI validation exports and tests
  styles.css                Responsive visual system
shared/                     Domain rules and policy packs
server/                     Local Fastify API and SQLite storage
tests/                      Domain and API integration tests
public/media/               Local campus media
plan.md                     Product specification
progress.md                 UI implementation and verification log
```

Three.js is loaded in a separate chunk. Vite reports the expected large graphics-engine chunk; initial UI content and the accessible location list remain separate from that scene.
