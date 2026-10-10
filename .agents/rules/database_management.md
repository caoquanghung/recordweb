---
trigger: database_work
---

# Database Work: Fast Lookup & Safety Rules

Use this file whenever a task touches Neon, SQL, migrations, database types, authentication ownership, presets, recordings metadata, or sharing permissions.

## 1. Fast Context Load

Read only these sources first, in this order:

1. `MEMORY.md` — current live schema and known database state.
2. `docs/database_migrations.md` — commands and migration workflow.
3. `database/migrations/` — authoritative schema history.
4. `src/types/database.ts` — application-side row shapes.
5. `src/lib/db.ts` and the relevant `src/app/api/*/route.ts` — runtime query behavior.

Do not treat SQL examples in architecture documents as the schema source of truth. Applied migration files and live verification are authoritative.

## 2. Standard Commands

Run from the repository root:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

- `db:status`: lists applied and pending ordered migrations.
- `db:migrate`: applies pending files transactionally and records them in `schema_migrations`.
- `db:verify`: checks required tables, ownership columns, and foreign keys.

The runner loads `DATABASE_URL` from `.env.local` and automatically discovers the Homebrew `libpq` client. Never print, log, or commit the connection string.

## 3. Current Schema Map

- `users`: authentication-provider identity mirror.
- `recordings`: user-owned recording metadata and Blob references; private by default through `is_public = FALSE`.
- `studio_presets`: user-owned studio configurations.
- `recording_shares`: explicit recipient access with `viewer` or `viewer_download` permission.
- `schema_migrations`: applied migration versions.

All recordings and preset reads/writes must be scoped by the verified `user_id`. Public visibility and direct-recipient sharing are separate authorization paths.

## 4. Schema Change Workflow

1. Run `npm run db:status` and inspect the latest file in `database/migrations/`.
2. Create the next sequential file, for example `0002_add_recording_description.sql`.
3. Never edit or rename an applied migration.
4. Do not include `BEGIN` or `COMMIT`; the runner wraps each file and history insert in one transaction.
5. Before adding `NOT NULL`, foreign keys, uniqueness, or destructive changes, inspect existing row counts and incompatible values.
6. Never invent ownership, silently delete data, or reset the database to make a migration pass.
7. Apply with `npm run db:migrate` only when the target environment is understood.
8. Run `npm run db:verify`, `npm run lint`, and `npm run build` afterward.
9. Update `src/types/database.ts`, relevant Route Handlers, documentation, and `MEMORY.md` in the same change.

## 5. Runtime Query Rules

- Use `getDb()` from `src/lib/db.ts` only in server code and Route Handlers.
- Never import database code into a client component or expose `DATABASE_URL` through `NEXT_PUBLIC_*` variables.
- Parameterize all values through the Neon tagged-template API; never concatenate user input into SQL.
- Require a verified session before user-owned reads or writes.
- Include ownership predicates in updates and deletes, such as `WHERE id = ${id} AND user_id = ${userId}`.
- Keep videos out of Postgres and Route Handler bodies; store only Vercel Blob metadata and URLs.
- Return sanitized errors to clients; do not expose connection details or raw SQL.

## 6. Live Database Safety

- Prefer read-only inspection before mutations.
- Treat `.env.local` as potentially pointing to shared or production data.
- Migration commands can require network approval in sandboxed agent sessions.
- Do not run migrations automatically during every Vercel build.
- For production, apply migrations as a controlled release step before deploying code that requires the new schema.
