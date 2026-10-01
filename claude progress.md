# Claude progress — backend, domain engine, API wiring

Approved plan: Node 24 + Fastify + SQLite (`node:sqlite`), mocked Gemini, demo role switcher with signed sessions, then wire the API into the UI built by the other model. Notes and API contract: `claude.md`.

## Status
| # | Step | Status |
|---|---|---|
| 1 | claude.md + progress file | ✅ done |
| 2 | shared/ domain types + policy packs | ✅ done |
| 3 | decision engine, permissions, redaction, related reports + unit tests | ✅ done |
| 4 | server skeleton: db, seed, auth, storage, audit | ✅ done |
| 5 | routes + mock Gemini + API tests | ✅ done |
| 6 | src/api client | ✅ done |
| 7 | wire API into UI | ✅ done (staff actions, live missions, public updates) |
| 8 | full verification | ✅ done |
| 9 | deploy readiness audit | ✅ done — see DEPLOY.md |

## Log
### 1 Oct 2026
- Read plan.md, progress.md, existing src (types, cases.ts, campus.ts, examples.ts) and the UI model's new components (IntakeDialog, CaseDialog, CampusExplorer). IntakeDialog hands a `CaseRecord` to `onSave`, so the API will plug in at App level; `CaseRecord` stays backward compatible.
- Created claude.md and this file.
- **Shared domain (`shared/`)**: types, 4 policy packs (food-safety, exit-access, campus-notice, general-facilities), deterministic decision engine, closure check, role matrix + mission eligibility, public redaction guard, related-report suggestions, shared validation.
- Bug caught by tests: related-report rule flagged a same-dish report from the next day. Now requires same counter/item **and** within 3 hours.
- **Server (`server/`)**: Fastify + `node:sqlite`, signed-cookie demo sessions, private uploads, audit log, mock Gemini (schema-validated, can only choose pack missions), service layer enforcing every plan.md rule, seed builds DEMO-0142 / DEMO-0143 through the real pipeline (all evidence `demo: true`).
- **Tests**: `tests/shared.test.ts` (16) + `tests/api.test.ts` (18) — **34/34 passing**. All 13 plan.md required tests covered, plus a full hybrid exit end-to-end run.
- API changes vs first draft of claude.md: publishing is `POST /api/public-updates/:id/publish`; reopen review is `POST /api/cases/:id/reopen/review`; operator reset `POST /api/demo/reset`.
- **Client (`src/api/`)**: typed `api` client for every endpoint, drop-in `caseStore.ts` (`loadCases/saveCase/clearCases`, plus `loadDemoCases`, `switchUser`, `ensureSession` with one shared in-flight login), hooks `useSession/useCaseViews/useMissions/usePublicUpdates`.
- **Wiring**: App.tsx import swapped to the API store and uses the server-returned record; `src/types.ts` extended compatibly (`view?`, `Disputed`, `Rejected`); `src/lib/cases.ts` validators re-export `shared/validation.ts`.
- **Port change**: 8787 is occupied on this machine by the `headroom` proxy → API moved to **8791** (server default, Vite proxy, .env.example).
- Dev session secret now persists in `server/data/.session-secret` so `tsx watch` restarts don't sign users out.
- **Verified**: `npm run typecheck` clean · `npx vitest run` 40/40 (34 mine + UI model's) · `npm run build` succeeds · live run through the Vite proxy: student multipart report → operator sees it → work order (24 h) → early close refused with 5 missing items → private file 200 for reporter / 404 for another student · headless Chrome loads the real UI, auto-signs in, and shows the server case ("My cases 1").

## Next
- UI model: build role switcher, operator dashboard, missions, department and public-update screens on the hooks (guide in claude.md), and reword the "local only" copy.

### 1 Oct 2026 — real Gemini connected
- User supplied a key (stored only in `.env`, gitignored). Probed endpoints: AI Studio accepts it; Vertex express does not. `gemini-2.5-*` retired for new users; `gemini-3.8-flash` overloaded (503).
- Added `server/gemini/real.ts`: JSON-schema-constrained REST calls, safety system instruction (no diagnosis, species certainty, blame or verdicts; submitted text treated as data), photos sent inline (max 3 × 4 MB), model chain with retry on 429/5xx/timeout, `FallbackGemini` → offline mock.
- Observe now receives the actual image bytes (was file names only).
- Server enforces the disconfirmation mission even if Gemini omits it (Gemini did omit it in live testing).
- Latency: first live run 41 s (3 sequential calls on the slow model) → split fast text model / stronger vision model and ran mission selection in parallel with photo analysis → **7–9 s** per photo report, **~2 s** per suggestion.
- Live checks: message split into attribution vs observable claim; a mismatched photo was correctly described as not showing food/exit; operator sees all 4 food missions incl. disconfirmation; 0 fallbacks used.
- Tests: new `tests/gemini.test.ts` (model failover, key sent as header not URL, no retry on 400, fallback on error/bad shape) → **46/46 passing**; typecheck clean.

### 1 Oct 2026 — full audit and deploy readiness
- Baseline: typecheck, tests, build, `npm audit` all clean.
- **Frontend gaps found and built** (new files, minimal edits to UI-model files):
  - `src/components/StaffActions.tsx` inside CaseDialog: approve work order (verified/precaution), work-order status, official-source check, closure records, verify closure, reopen review, draft/publish public update, related reports, identity reveal, abuse flag.
  - `src/components/MissionsBoard.tsx` replaces the static Missions page: live missions, eligibility reasons, accept, challenge code, evidence + findings submission.
  - `src/components/PublicUpdatesFeed.tsx` on Public updates (falls back to the original empty state).
  - `src/components/staff.css`. App.tsx: refresh callback, role-aware case tab label, demo count.
- **Bugs fixed**: staff file uploads were sent as `photo` (403) → kind chosen from permissions; every attachment of every case was downloaded on list load → served lazily by URL; label wrapping; repeated sentence in exit public update.
- **Server hardening**: helmet (CSP, nosniff, frame protection, HSTS on HTTPS), rate limiting on Gemini/write routes, Secure cookies in production, file signature check, `ALLOW_DEMO_LOGIN` switch, SESSION_SECRET required in production, trust proxy, static serving of `dist` with SPA fallback and cache headers, graceful shutdown. MissionView now carries evidence kinds + allowed targets.
- **Deploy files**: Dockerfile, .dockerignore, `npm start`, `npm run check`, `engines: node >=24`, full `.env.example`, `DEPLOY.md` with checklist + results.
- **Verification**: 53/53 tests (new `tests/deploy.test.ts`); production runtime rebuilt with prod-only deps; **19/19 browser checks** on the production build in Chrome, driving the whole primary demo by clicks (student report → missions → work order → blocked close → independent confirmation → closure → blocked unsafe text → published update), no CSP violations, no page errors, no 5xx, no horizontal scroll on phone.
- Not done: accessibility audit, real authentication.

### 1 Oct 2026 — Docker verified
- `docker build` OK (473 MB). Image has no `.env`/`server/data`, runs as `node`, refuses to start without SESSION_SECRET, HEALTHCHECK healthy.
- Bug found: `CMD npm start` made npm PID 1; on `docker stop` npm killed node without graceful shutdown (exit 1). Fixed: CMD runs node directly → SIGTERM handled, exit 0 in ~0.4 s.
- Volume persistence + sessions across restart confirmed. Full browser E2E against the container: 19/19 PASS, exit 0.

### 1 Oct 2026 — fixed startup crash, deployed
- User started the image with Docker Desktop's Run button (no env) → crash "SESSION_SECRET is required". Changed: if unset, a random 256-bit secret is generated once and kept in `RQ_DATA_DIR/.session-secret`; short user-supplied secrets are still rejected. Verified: plain `docker run` works and sessions survive restart.
- Local deployment: container `realityquorum`, `--restart unless-stopped`, port 8080, volume `realityquorum-data`, live Gemini key → healthy.
- Public: new project-only git repo (home-folder repo untouched), `.gitattributes` (LF), videos/reference/.claude excluded, key verified absent from tracked files, stray curl cookie file removed. Pushed to private repo github.com/mynameisizhan-coder/realityquorum (main).
- `render.yaml` (free Docker web service, Singapore, generated SESSION_SECRET, GEMINI_API_KEY entered in dashboard, rate limit 20/min, demo login on). Render runtime simulated locally (PORT=10000, no disk) → healthy.
- Remaining: user creates the Render Blueprint (needs their Render login).

### 1 Oct 2026 — live Render verification (https://realityquorum.onrender.com)
- Running latest commit (new hostel photo + sketch layout in bundle). Health OK, live Gemini (`gemini-3.5-flash-lite`, ~2 s, claims split correctly).
- HTTPS: http→https 301, HSTS, CSP (+upgrade-insecure-requests), nosniff, frame protection; session cookie HttpOnly + Secure + SameSite=Lax.
- Access control over the internet: private endpoints 401 anonymously, forged cookie 401, another student 404 on someone else's case, canteen sees alias only, canteen identity reveal 403.
- Browser E2E against live site: **19/19 PASS** (full primary demo by clicks, mobile layout, no CSP violations, no page errors, no 5xx).
- Assets: ~361 KB transferred (gzip/br), hashed assets cached immutable.
- Rate limit active (`x-ratelimit-limit: 20`). Looked bypassed in testing because the tester's ISP rotates public IPv4 addresses (3 IPs in 8 requests, confirmed via Cloudflare trace); limiting is per IP by design.
- Demo data reset afterwards via operator `/api/demo/reset` → DEMO-0142 Action in progress, DEMO-0143 Evidence review, 0 public updates.

### 1 Oct 2026 — bug fixes: operator photo download, volunteers/supervisors not receiving tasks
- **Download**: server returned the photo correctly (verified on the user's live case RQ-307A58, 171,924 bytes, as operator). Root cause of the failure: case data erased by a free-plan restart / demo reset while the operator still had the old case on screen; the app then failed silently. Fixes: opened cases are re-fetched from the server (erased case → closed with a clear message and removed from the list); attachments get explicit View + Download buttons with error messages (missing file, expired session); server `?download=1` mode, `file_missing` 404, RFC 5987 `filename*` for non-English names; broken thumbnails fall back to an icon; phone layout fixed (CSS specificity clash with `.evidence-file > div`).
- **Tasks**: live Gemini often selected only the reporter's mission, so new reports gave no task to canteen supervisors (and on food reports, only the disconfirmation task to volunteers). Server now keeps Gemini's choice but guarantees every role in the pack at least one task, always adds disconfirmation, drops issuer checks on direct reports, and falls back to the full set if Gemini returns nothing. Missions taken by someone else are hidden from others (operator still sees them under "Being handled by others"); your "Submitted" list now only shows your own. Students no longer see the volunteer-only exit task; added `exit.reporter_capture` so the reporter of an exit issue has a task. Navigation shows a count of tasks you can act on.
- Tests: new `tests/regressions.test.ts` (6) → **59/59**. Browser: role sweep through the UI for all 10 accounts, new report → volunteers 3→4, supervisor 1→2; operator downloads photo/PDF/non-English name; erased-case handling; full E2E 19/19 on the local container.

### 1 Oct 2026 — Gemini quality, photo verification, official-website check for circulars
- **Quota found**: key is on the free tier, 20 requests/day/model; `gemini-3.7-flash` was exhausted, so photo analysis had silently fallen back to the mock on the live site. Now: 5–6 models per task (text/vision/web), fastest first (measured: flash-lite ~2 s, 3.6-flash ~5 s, 3.5-flash up to 27 s), a model that hits a daily quota is skipped for an hour, per-request timeout 15 s and 30 s budget; suggestions cached 15 min (form + submit no longer call twice); Gemini mission selection removed (all approved pack missions per route; Gemini still drives the category, which picks the pack).
- **Quality eval (12 realistic reports)**: categories 9/12 before; fixed with category/tier definitions → "pc spoiled" Facilities, UPI fee scam Campus notice/Urgent, direct reports no longer get bogus "attribution" claims.
- **Verification flaw fixed**: a photo attached to a direct report used to auto-support every observable condition (a garden photo "confirmed" an insect in food). Now Gemini answers per condition visible / not_visible / unclear and only "visible" counts; unanalysed or unrelated photos are "kept for review". Human mission findings stand, but get an automated review flag if the photo doesn't seem to show them.
- **Official website check**: for message cases with a "who issued it" question, Gemini (URL context tool) reads https://nitte.edu.in/nmamit/announcement.php and news-all.php. The server re-downloads the page and accepts "confirmed/contradicted" only if the exact quote is on an official https nitte.edu.in/nmamit page; otherwise "unverified". "Not found" never contradicts (plan.md) and only counts if the pages were actually retrieved. Result stored on the case (`officialCheck`), on the ledger as `official_source` (verified quote) or `observation`, shown in an OfficialCheckCard; operators/trust can re-run it (`POST /api/cases/:id/official-check`).
- Live results: "closed tomorrow due to rain" → not found (Unresolved); "NBA accreditation till 2028" → confirmed with verified quote; "lost NBA accreditation" → contradicted with verified quote; ~3 s each. Garden photo on a food report → nothing confirmed, Gemini: "No food items… visible".
- Tests: new `tests/verification.test.ts`, updated gemini tests → **74/74**. Local Docker: E2E 19/19, roles sweep OK, browser test of the website check (student sees verdict + verified quote; operator re-run works).
