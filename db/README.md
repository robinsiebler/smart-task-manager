# Database

Oracle XE, migrated with plain numbered SQL scripts (no migration framework).

## Migrations

Files in `migrations/` are named `V<n>__<description>.sql` and applied strictly in
numeric order.

| File | What it does |
|---|---|
| `V1__create_users.sql` | `users` table |
| `V2__create_categories.sql` | `categories` table, owned per-user |
| `V3__create_tasks.sql` | `tasks` table (originally a single `category_id` FK, removed in V8) |
| `V4__create_indexes.sql` | Indexes for common task/category lookups |
| `V5__rename_name_to_username.sql` | Renames `users.name` to `users.username`, adds a unique constraint |
| `V6__create_password_resets.sql` | `password_resets` table for the forgot/reset-password flow |
| `V7__create_password_history.sql` | `password_history` table, used to block reusing recent passwords |
| `V8__create_task_categories.sql` | `task_categories` join table for many-to-many task↔category, migrates existing `tasks.category_id` data across, then drops that column |

## Applying migrations

**Fresh database:** run `node backend/scripts/run-migrations.js`. It reads every
`.sql` file in `migrations/`, in order, and executes each one's statements against
the database configured in `.env`. This is what CI does on every run, against a
throwaway Oracle container.

**Already-migrated database (adding a new migration):** `run-migrations.js` is
**not** safe to rerun here — it has no record of which migrations already ran, so
it will try to recreate existing tables/constraints and fail. Instead, apply only
the new file's statements directly, e.g.:

```js
const fs = require('fs');
const oracledb = require('oracledb');
const config = require('./backend/src/config/env');

(async () => {
  const sql = fs.readFileSync('db/migrations/V9__something.sql', 'utf8');
  const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
  const connection = await oracledb.getConnection({
    user: config.oracle.user,
    password: config.oracle.password,
    connectString: config.oracle.connectString,
  });
  for (const statement of statements) await connection.execute(statement);
  await connection.commit();
  await connection.close();
})();
```

This is how `V5` through `V8` were applied to the local dev database during
development, without re-running (and failing on) `V1`–`V4`.
