# Database Migrations with `psql`

RecordWeb uses ordered SQL files executed by the local PostgreSQL `psql` client. Applied versions are stored in the Neon table `schema_migrations`.

## Commands

From the VS Code terminal:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

The scripts load `DATABASE_URL` from `.env.local` when the variable is not already provided by the shell. The connection URL is translated into standard libpq environment variables, so credentials are not printed or placed in command arguments.

The runner automatically discovers:

- `psql` on `PATH`.
- Apple Silicon Homebrew `libpq` at `/opt/homebrew/opt/libpq/bin/psql`.
- Intel Homebrew `libpq` at `/usr/local/opt/libpq/bin/psql`.
- A custom executable set through `PSQL_PATH`.

## VS Code Tasks

Open the Command Palette and select **Tasks: Run Task**, followed by:

- **Database: Migration Status**
- **Database: Apply Migrations**
- **Database: Verify Schema**

Running the apply task is the explicit migration action; review the selected environment before starting it.

## Adding a Migration

Create the next file in `database/migrations` using this naming format:

```text
0002_short_lowercase_description.sql
```

Rules:

- Never edit a migration after it has been applied to a shared database.
- Add a new migration for every schema change.
- Do not write `BEGIN` or `COMMIT`; the runner executes each file and its history insert in one transaction.
- Prefer additive, backward-compatible changes.
- Include explicit checks before destructive or ownership-changing operations.
- Run `npm run db:status` before and after migration.
- Commit the migration file with the application code that depends on it.

## Environment Safety

`.env.local` normally targets the developer database. For another environment, set `DATABASE_URL` explicitly before running the command. Always confirm the Neon branch and database in the connection string before applying migrations.

Do not run database migrations during every Vercel application build. Concurrent deployments can race, and application builds should remain reproducible. Run production migrations as a separate, controlled deployment step before releasing code that requires the new schema.

## Legacy Data

Migration `0001_user_owned_recordings.sql` upgrades the original RecordWeb tables. It refuses to add mandatory ownership when existing recordings or presets have no user. Assign legacy rows to a real `users.id` first, then rerun the migration. It never invents an owner or silently deletes data.
