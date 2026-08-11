# fusguessr

A daily guessing game. Every day one AI-generated image shows two Pokémon
(national dex 1–386, Kanto through Hoenn) fused into a single Game Boy
Advance-style sprite. You get six guesses to name both, and the image zooms out
a step with every wrong answer.

- Order never matters — either half of the fusion can go in either box.
- Guessing a Pokémon from the **same evolution line** as one of the answers
  raises a "so close" hint.
- Everyone sees the same puzzle, cropped to the same starting point, and it
  rolls over at **4am America/Los_Angeles**.

---

## Quick start

```bash
# 1. Dependencies
npm install

# 2. Local Postgres (app database + a separate one for integration tests)
docker compose up -d

# 3. Environment
cp .env.example .env      # then fill in the values described below

# 4. Schema and reference data
npm run db:migrate
npm run db:seed           # loads all 386 Pokémon from the committed snapshot

# 5. Put a puzzle live so there is something to play
npm run dev:puzzle

# 6. Run it
npm run dev
```

The minimum you need in `.env` to get a playable local app is `DATABASE_URL`,
`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`, and
`FUSGUESSR_FAKE_IMAGE_PIPELINE=1`. That last one matters: it swaps Vertex AI
and Cloud Storage for a local procedural stand-in, so **no GCP project is
required for local development** and no image generation costs money.

---

## Environment variables

Copy `.env.example` to `.env`. Real values never get committed; `.env.example`
is the only env file that does, and it exists to document which keys exist.

| Key | Local (`.env`) | Production (Secret Manager → Cloud Run) |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/fusguessr` | **Cloud SQL socket form** — see gotcha P1 |
| `TEST_DATABASE_URL` | `…/fusguessr_test` | not used |
| `AUTH_SECRET` | `openssl rand -base64 32` | Secret Manager |
| `AUTH_GOOGLE_ID` | Google OAuth client ID | Secret Manager |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | Secret Manager |
| `AUTH_TRUST_HOST` | leave unset | **`true`** — required, see gotcha P2 |
| `ADMIN_EMAILS` | your Google account email | Secret Manager |
| `CRON_SECRET` | any string | Secret Manager |
| `GOOGLE_CLOUD_PROJECT` | only if calling Vertex for real | plain env var |
| `VERTEX_LOCATION` | `us-central1` | plain env var |
| `VERTEX_IMAGE_MODEL` | optional override | optional override |
| `GCS_BUCKET` | only if calling GCS for real | plain env var |
| `GOOGLE_APPLICATION_CREDENTIALS` | only as a last resort — see L1 | **never set it** |
| `FUSGUESSR_FAKE_IMAGE_PIPELINE` | `1` | unset |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | **build arg**, see gotcha P4 |

**Where each lives.** Local values go in `.env` (gitignored). Production
secrets go in **GCP Secret Manager** and are attached with
`gcloud run deploy --set-secrets`. **GitHub repository secrets hold only what
CI/CD needs** — the Workload Identity Federation provider, the deploy service
account, project id, bucket, Cloud SQL instance, and the public app URL.
Application secrets are not duplicated into GitHub.

### Getting the Google OAuth credentials

1. Google Cloud console → *APIs & Services* → *Credentials* → *Create
   credentials* → *OAuth client ID* → *Web application*.
2. Add **both** redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-production-domain>/api/auth/callback/google`
3. Put the client id and secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

Admin access is granted by putting your email in `ADMIN_EMAILS`. On your first
sign-in that promotes your user row to `ADMIN`, and **the database row is
authoritative from then on** — removing the email later does not demote you,
which is deliberate. Demote by changing the database.

---

## How it fits together

| Area | Where | Notes |
| --- | --- | --- |
| Game logic | `lib/game/` | Pure and unit tested: grading, zoom curve, streaks, share text |
| Puzzle lifecycle | `lib/game/fusion-service.ts`, `lib/game/rollover.ts` | `DRAFT → APPROVED → SCHEDULED → LIVE → ARCHIVED` |
| Image pipeline | `lib/vertex/`, `lib/image/`, `lib/gcs/` | Server-only; each has a single mockable seam |
| Auth | `lib/auth/` | Auth.js v5 split config (edge + Node halves) |
| Time | `lib/time/la-date.ts` | Every LA-time conversion goes through here |

A few decisions worth knowing about before changing things:

**Pixel art is a deterministic post-process, not a prompt.** Imagen cannot
reliably produce genuine low-colour pixel art from a text prompt — it produces
smooth art that resembles it. So the prompt only asks for a clean, centred,
simply-composed subject, and `lib/image/pixelate.ts` guarantees the sprite look:
downscale to 64×64 nearest-neighbour → quantise to 16 colours → snap every
colour to the GBA's 15-bit RGB555 space → upscale with hard edges. That matches
the real Generation III sprite format (64×64, 4bpp indexed colour). Each sprite
gets its own palette, as real Gen III sprites did, rather than sharing one
global palette that would tint every puzzle identically.

**A Pokémon pair can never be fused twice, structurally.** `canonicalPair()`
orders every pair `A < B`, and a unique index covers the pair. But a unique
index alone only works if every write site remembers to canonicalise, so there
is also a `CHECK (pokemonAId < pokemonBId)` constraint — a reversed pair cannot
be stored by *any* code path, including raw SQL. This is not theoretical: the
constraint caught a real bug where `createFusion` trusted a caller-supplied pair
and stored it reversed.

**The rollover is idempotent at every exit path.** Cloud Scheduler retries on
any non-2xx and can deliver twice. If nothing is staged for today, the previous
puzzle stays live and the admin dashboard shows a warning — the homepage is
never blanked.

**Admin QA attempts are flagged and excluded from all statistics.** Whether an
attempt counts as a preview is derived from the puzzle's own status, never from
a client-supplied flag.

---

## Testing

```bash
npm test                   # unit: pure logic, no database, no network
npm run test:integration   # against real Postgres
npm run lint
npm run typecheck
```

The unit suite covers grading, the zoom curve, streak arithmetic, LA-time
conversions across both DST transitions, the share text, the admin allowlist,
and the pixelation pipeline. The integration suite runs against real Postgres so
the constraints that encode the game's guarantees are genuinely exercised, and
covers the rollover (including DST and repeated delivery), the full six-guess
loop, and the regenerate/reroll paths that must discard a stale QA play.

Vertex AI and Cloud Storage are never called in tests —
`FUSGUESSR_FAKE_IMAGE_PIPELINE=1` is set by the test setup.

**No end-to-end browser suite yet, deliberately.** The DB-backed integration
tests plus mocked externals already cover correctness for what is a single-page
game loop, so a Playwright suite would mostly duplicate that at much higher
flakiness and cost — and would need a test-OAuth story before it could sign in
at all. Worth revisiting once the UI has stabilised.

---

## Deploying to Cloud Run

Everything lives in one GCP project. Vertex AI already requires one, so putting
compute, storage, secrets and the database there too means a single service
account and no cross-cloud key juggling. In particular **no service account JSON
key exists in production** — Cloud Run's attached service account provides
Application Default Credentials to both Vertex AI and Cloud Storage.

### One-time GCP setup

```bash
PROJECT_ID=your-project
REGION=us-central1

gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com --project "$PROJECT_ID"

gcloud artifacts repositories create fusguessr \
  --repository-format=docker --location="$REGION"
```

Create three service accounts:

| Service account | Roles | Used by |
| --- | --- | --- |
| runtime | `aiplatform.user`, `storage.objectAdmin` (bucket-scoped), `cloudsql.client`, `secretmanager.secretAccessor` | The Cloud Run service |
| scheduler-invoker | `run.invoker` | Cloud Scheduler |
| deployer | `run.admin`, `artifactregistry.writer`, `iam.serviceAccountUser` | GitHub Actions, via WIF |

Then create the Cloud SQL instance, the GCS bucket, and these Secret Manager
secrets (the names are what `deploy.yml` expects):
`fusguessr-database-url`, `fusguessr-auth-secret`, `fusguessr-google-id`,
`fusguessr-google-secret`, `fusguessr-admin-emails`, `fusguessr-cron-secret`.

### GitHub repository secrets

`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`,
`GCP_RUNTIME_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `CLOUD_SQL_INSTANCE`
(`project:region:instance`), `GCS_BUCKET`, `APP_URL`.

### The daily rollover

```bash
gcloud scheduler jobs create http fusguessr-rollover \
  --location="$REGION" \
  --schedule="0 4 * * *" \
  --time-zone="America/Los_Angeles" \
  --uri="https://<your-service-url>/api/cron/rollover" \
  --oidc-service-account-email="scheduler-invoker@$PROJECT_ID.iam.gserviceaccount.com" \
  --headers="Authorization=Bearer <CRON_SECRET>"
```

`--time-zone` is the important part: Cloud Scheduler tracks DST natively, so
there is no UTC-offset arithmetic to get wrong. The endpoint re-checks the hour
in LA time anyway, and is safe to call at any hour or any number of times.

### First deploy, in order

1. Provision GCP (above).
2. Register the OAuth client against the **final** domain (see gotcha P3).
3. Push to `main` — CI builds, pushes, migrates, and deploys.
4. Seed the Pokémon table once against production:
   `gcloud run jobs ... --command npx --args "prisma,db,seed"`.
5. Create the Cloud Scheduler job.
6. Sign in, generate some fusions, approve them, and batch-stage a week.
7. After the first 4am firing, check the `RolloverLog` table.

---

## Gotchas

### Local

**L1 — Use Application Default Credentials, not a JSON key.** Run
`gcloud auth application-default login` and
`gcloud auth application-default set-quota-project <project>`. Only fall back to
`GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json` if ADC is impractical; it is
gitignored, and it must never be set on Cloud Run. Better still, leave
`FUSGUESSR_FAKE_IMAGE_PIPELINE=1` on and skip GCP entirely.

**L2 — OAuth redirect URIs must match exactly.** A trailing slash or an
`http`/`https` mismatch is the single most common sign-in failure.

**L3 — The OAuth consent screen in "Testing" status only admits listed test
users**, and its refresh tokens expire after 7 days. Add your own email as a
test user and expect to re-authenticate periodically.

**L4 — Auth.js v5 is still on the `beta` dist-tag** (`next-auth@5.0.0-beta.32`).
That is the expected way to use v5 today, but pin it — betas move.

**L5 — Never point `TEST_DATABASE_URL` at your dev database.** The integration
suite truncates every table between cases. It refuses to run against a URL
without `test` in it, but do not rely on that as your only safeguard.

**L6 — Seed before using the admin panel.** The guess combobox and the
same-line hint both need the 386 seeded rows.

**L7 — Scripts that import server-only modules need
`--conditions=react-server`.** Anything under `lib/vertex`, `lib/image`,
`lib/gcs` or the game services starts with `import "server-only"`, which throws
outside a Server Component. The `dev:puzzle` script already passes the flag;
copy it if you write another.

**L8 — Regenerating the Pokémon snapshot needs network access to PokeAPI.**
`npm run pokemon:cache` hits `pokeapi.co`. If that host is blocked,
`POKEAPI_SOURCE=mirror npm run pokemon:cache` reads PokeAPI's own static JSON
dump from GitHub instead. You should rarely need either — the snapshot is
committed.

**L9 — `npm run build` warns that `package.json#prisma` is deprecated.** It is
cosmetic; Prisma 6 still honours it, and migrating to `prisma.config.ts` changes
how `.env` is loaded. Left alone on purpose.

### Production

**P1 — The Cloud SQL connection string is a socket path, not `host:port`.**

```
postgresql://USER:PASS@localhost/fusguessr?host=/cloudsql/PROJECT:REGION:INSTANCE&connection_limit=5
```

You also need `--add-cloudsql-instances` at deploy time and
`roles/cloudsql.client` on the runtime service account. Missing any one of the
three presents as a hung app rather than a clear error.

**P2 — `AUTH_TRUST_HOST=true` is mandatory on Cloud Run.** TLS terminates at a
proxy, and Auth.js v5 will not trust `X-Forwarded-Host` without it — you get
`UntrustedHost` and sign-in fails. This is the classic "works locally, 500s in
production".

**P3 — Cloud Run's auto-assigned `*.run.app` URL changes if the service is
deleted and recreated**, which silently invalidates your registered OAuth
redirect URI. Map a custom domain *before* registering OAuth credentials.

**P4 — `NEXT_PUBLIC_*` is inlined at build time.** It must be passed as a
`docker build --build-arg`; setting it only as a Cloud Run runtime variable
leaves it `undefined` in the browser. `deploy.yml` passes it both ways for this
reason.

**P5 — Never run migrations on container start.** Cloud Run can start many
instances at once and they will race applying the same migration. `deploy.yml`
runs `prisma migrate deploy` as its own Cloud Run Job, before traffic moves.

**P6 — Prisma needs OpenSSL and a matching engine binary.** The Dockerfile uses
`node:22-slim` and installs `openssl`; `schema.prisma` declares the
`debian-openssl-3.0.x` target. Switching to Alpine means adding the musl target
and rebuilding sharp, and the failure mode is a runtime
`PrismaClientInitializationError: Query engine binary not found`.

**P7 — `output: standalone` does not copy static assets.** `.next/static` and
`public/` must be copied into the runner stage by hand or the site renders
unstyled. The Dockerfile does this; keep it if you edit the build.

**P8 — Listen on `$PORT` (8080).** Next's standalone `server.js` honours it, but
anything hardcoded to 3000 fails Cloud Run's health check with an opaque
"container failed to start".

**P9 — Watch the connection pool.** Instances × Prisma pool size can exhaust a
small Cloud SQL tier's ~100 `max_connections`. Set `connection_limit=5` in the
URL and cap `--max-instances` (the deploy sets 4).

**P10 — The container timezone is UTC.** Never use `new Date().getHours()`;
route everything through `lib/time/la-date.ts`, which uses `Intl` with an
explicit named zone.

**P11 — If Cloud Scheduler cannot invoke the service, puzzles silently stop
rolling over.** The invoker service account needs `roles/run.invoker`. The
`RolloverLog` table exists partly so this is detectable — check it after the
first scheduled run, and consider alerting on a day with no row.

**P12 — Public GCS reads may be blocked by org policy.** Uniform bucket-level
access plus `allUsers` → `roles/storage.objectViewer` is the simple path, but
`storage.publicAccessPrevention` forbids it in many organisations. Fall back to
signed URLs if so.

**P13 — Confirm Imagen availability in your region.** `roles/aiplatform.user` is
necessary but not sufficient: model availability varies by `VERTEX_LOCATION` and
some variants need allowlisting. Verify before relying on it, and note that
Imagen has no free tier — admin prompt iteration costs real money. Regeneration
is not seed-stable either, so every regenerate is a fresh roll rather than a
tweak of the current image.

**P14 — Cloud SQL does not scale to zero.** The smallest tier still bills
roughly $8–10/month. If that is unwanted for a side project, a serverless
Postgres (Neon, Supabase) is a `DATABASE_URL` swap that also removes gotchas P1
and P9 entirely.

**P15 — Cold starts.** Cloud Run scales to zero by default, so the first request
after idle pays Next.js boot plus Prisma connect. Set `--min-instances=1` if the
daily first load should feel instant.

---

## Known issues

- `npm audit` reports advisories in `teeny-request`/`retry-request`, reached
  transitively through `@google-cloud/storage`. The latest version of that
  package still pulls them in, so there is no upgrade to take; `npm audit fix
  --force` would downgrade the storage client rather than fix anything.
- The pixelation pipeline reliably fixes colour depth, edge crispness and pixel
  alignment, but it cannot rescue a badly composed or cluttered generation.
  Some fusions will need a regenerate or a prompt tweak instead.

---

## Roadmap

Not built yet, but the schema and components leave room for it: a post-win poll
letting players vote on a favourite name for the day's fusion, and player-
submitted name suggestions that can later be featured. `Fusion.name` is already
optional and admin-writable, the `WON` status already gates when a poll would
appear, and voting/suggestion tables would be purely additive.
