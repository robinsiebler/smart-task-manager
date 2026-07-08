# Smart Task Manager

A task manager with categories, filtering/sorting, a dashboard, and account
management. Node/Express + Oracle backend, a vanilla JS frontend (no
build step), an end-to-end Playwright test suite, and a CI pipeline that runs
all of it.

## Setup

### Prerequisites

- Node.js 22
- A running Oracle database (Oracle XE works well for local dev — this
  project was built against a local Oracle XE instance)

### 1. Database

Apply the migrations in `db/migrations/` to your Oracle database, in order
(`V1` through `V8`). Against a fresh/empty database:

```bash
cd backend
node scripts/run-migrations.js
```

This script is **fresh-database-only** — it has no schema-version tracking
and will fail if run again against a database that's already been migrated.
See `db/README.md` for how to apply a single new migration to an
already-migrated database, and `db/ERD.md` for the schema itself.

Optionally, load some demo data (a demo user, a few categories, a few tasks)
into a freshly migrated database:

```bash
# via sqlplus, or any tool that can run a .sql file against your DB
sqlplus your_db_user/your_db_password@your_connect_string @db/seeds/dev_seed.sql
```

Demo login afterward: `demo@example.com` / `DemoPass123`.

### 2. Environment variables

Copy the root `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Port the backend listens on (defaults to 3000 if unset) |
| `DB_USER` | Oracle database user |
| `DB_PASSWORD` | Oracle database password |
| `DB_CONNECTION_STRING` | Oracle connect string, e.g. `localhost/XE` |
| `JWT_SECRET` | Signs/verifies login tokens — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

`.env` is gitignored and must never be committed — see `backend/src/config/env.js`,
which loads it and fails fast if any required variable is missing.

### 3. Install and run

```bash
# Backend (API + serves the frontend statically)
cd backend
npm install
npm start                 # http://localhost:3000 (or your PORT)
npm test                  # backend test suite (node:test)
npm run test:coverage     # same, with a coverage report

# End-to-end tests (drives the real app in a headless browser)
cd e2e
npm install
npx playwright install chromium   # first time only
npm test

# Linting (repo root)
npm install
npm run lint
```

The frontend has no separate install/build step — `backend`'s Express server
serves `frontend/public`, `frontend/css`, and `frontend/js` directly as static
files, so running the backend is enough to use the app in a browser.

## Architecture

```
backend/     Express API + static file server
  src/
    config/       env var loading, Oracle connection pool
    controllers/  thin HTTP layer -- req/res in, calls a service, shapes the response
    services/     business logic, validation-adjacent rules, orchestrates models
    models/       one file per table/resource, all DB access (parameterized SQL)
    routes/       Express routers, wire up middleware + controller per endpoint
    middleware/   auth (JWT), request validation, centralized error handling
    utils/        small shared helpers (HttpError, asyncHandler, logger)
  test/
    integration/  black-box tests against a running app + real Oracle DB
    unit/         isolated tests for middleware logic
  scripts/       one-off scripts (migration runner)

frontend/    Vanilla JS, no framework, no bundler
  public/        one .html file per page (login, register, tasks, dashboard, profile, ...)
  js/             one .js file per page, plus api.js (fetch wrapper) and utils.js (shared helpers)
  css/            base.css (layout/typography) + components.css (everything else)
  assets/         static assets

db/
  migrations/    numbered SQL migration scripts (V1...V8), applied in order
  seeds/         optional demo data for a fresh dev database
  ERD.md         entity/relationship documentation + Mermaid diagram source
  README.md      how migrations work, how to apply a new one

e2e/         Playwright end-to-end test suite (separate from backend/'s own tests --
             this drives the real running app through a real browser)
  tests/         one spec file per feature area
  helpers/       shared test setup: API-based fixtures, DB cleanup, UI login helper
  playwright.config.js   auto-launches the real backend server before tests run

.github/workflows/
  ci.yml         lint, dependency audits, backend tests+coverage, e2e tests
  codeql.yml     CodeQL security scanning
```

**Request flow**: `routes/` wires middleware (auth, validation) + a controller
to each endpoint → the `controller` extracts request data and calls a
`service` → the `service` holds business rules and calls one or more `models`
→ `models` are the only layer that touches the database, always via
parameterized Oracle bind variables.

**Auth**: stateless JWT, sent as `Authorization: Bearer <token>` and stored
client-side in `localStorage`. No server-side session table.

## API summary

All endpoints below are prefixed with `/api`. Endpoints marked 🔒 require an
`Authorization: Bearer <token>` header.

### Users / auth (`/api/users`, `/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/users/register` | Create an account |
| POST | `/users/login` | Log in, returns a JWT + the user |
| GET 🔒 | `/users/me` | Current user's profile |
| PUT 🔒 | `/users/me` | Update username/email |
| PUT 🔒 | `/users/me/password` | Change password (rejects reusing a recent one) |
| DELETE 🔒 | `/users/me` | Delete account (password-confirmed; cascades tasks/categories/history) |
| POST | `/auth/forgot-password` | Request a password reset (dev-only: token is printed to the server console, not emailed) |
| POST | `/auth/reset-password` | Complete a password reset with that token |

### Tasks (`/api/tasks`, all 🔒)
| Method | Path | Description |
|---|---|---|
| GET | `/tasks` | List the user's tasks. Query params: `title`, `status`, `priority`, `categoryId`, `dueDate` (all optional, combine with AND) |
| GET | `/tasks/:id` | Get one task |
| POST | `/tasks` | Create a task (`categoryIds: number[]` for multi-category) |
| PUT | `/tasks/:id` | Update a task (blocked once a task is `Completed`) |
| DELETE | `/tasks/:id` | Delete a task |
| PATCH | `/tasks/:id/complete` | Mark a task `Completed` |

### Categories (`/api/categories`, all 🔒)
| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List the user's categories, alphabetically |
| POST | `/categories` | Create a category |
| PUT | `/categories/:id` | Rename a category |
| DELETE | `/categories/:id` | Delete a category (removes it from any tasks that had it) |

### Dashboard (`/api/dashboard`, 🔒)
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | Summary counts (total/completed/pending/overdue) plus breakdowns by category and priority |

## Branching strategy

Three tiers:
- **`main`** — stable, deployable.
- **`dev`** — integration branch; feature branches merge here first.
- **`feature/*`** (or `fix/*`, `docs/*`) — one branch per unit of work, cut from `dev`.

Merge rules:
- `feature/*` → `dev` via pull request (never a direct push/merge).
- `dev` → `main` only after CI is green on `dev`, also via pull request.

Merged branches are left in place rather than deleted, to preserve a full
record of each individual change.

## CI/CD pipeline

Two GitHub Actions workflows run on every push/PR to `main` and `dev`:

**`ci.yml`** — a single job, in order:
1. **Lint** (`eslint .` at the repo root) — fails fast before the slower steps below.
2. **Dependency audit** (`npm audit --audit-level=high`) for the root, `backend/`, and `e2e/` dependency trees.
3. **Backend tests** (`npm run test:coverage`) against a real Oracle XE service container spun up for the job, migrations applied first.
4. **E2E tests** (`npx playwright test`) — the same backend server, driven through a real headless Chromium browser.
5. On failure, the Playwright report (including traces/screenshots) is uploaded as a build artifact for debugging.

The job also has a timeout, a minimal `permissions: contents: read`, and a
concurrency group that cancels superseded runs on the same branch/PR.

**`codeql.yml`** — CodeQL static analysis for JavaScript/TypeScript, on the
same push/PR triggers plus a weekly schedule.
