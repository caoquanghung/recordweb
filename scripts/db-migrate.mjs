import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(projectRoot, "database", "migrations");
const command = process.argv[2] ?? "migrate";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is missing. Add it to .env.local or export it in the current shell."
  );
  process.exit(1);
}

function findPsql() {
  const candidates = [
    process.env.PSQL_PATH,
    "psql",
    "/opt/homebrew/opt/libpq/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      stdio: "pipe",
    });

    if (result.status === 0) return candidate;
  }

  console.error(
    "psql was not found. Install Homebrew libpq (`brew install libpq`) or set PSQL_PATH."
  );
  process.exit(1);
}

const psql = findPsql();

function connectionEnvironment(connectionString) {
  let connectionUrl;

  try {
    connectionUrl = new URL(connectionString);
  } catch {
    console.error("DATABASE_URL is not a valid PostgreSQL connection URL.");
    process.exit(1);
  }

  if (!["postgres:", "postgresql:"].includes(connectionUrl.protocol)) {
    console.error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
    process.exit(1);
  }

  return {
    PGHOST: connectionUrl.hostname,
    PGPORT: connectionUrl.port || "5432",
    PGDATABASE: decodeURIComponent(connectionUrl.pathname.slice(1)),
    PGUSER: decodeURIComponent(connectionUrl.username),
    PGPASSWORD: decodeURIComponent(connectionUrl.password),
    PGSSLMODE: connectionUrl.searchParams.get("sslmode") || "require",
    ...(connectionUrl.searchParams.has("channel_binding")
      ? { PGCHANNELBINDING: connectionUrl.searchParams.get("channel_binding") }
      : {}),
  };
}

const psqlEnvironment = {
  ...process.env,
  // Keep credentials in libpq environment variables rather than command arguments.
  ...connectionEnvironment(process.env.DATABASE_URL),
};

function runPsql(args, options = {}) {
  const result = spawnSync(
    psql,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", ...args],
    {
      cwd: projectRoot,
      env: psqlEnvironment,
      encoding: "utf8",
      ...options,
    }
  );

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? "";
}

runPsql([
  "--command",
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
]);

if (!existsSync(migrationsDirectory)) {
  console.error(`Migration directory not found: ${migrationsDirectory}`);
  process.exit(1);
}

const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of migrationFiles) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
    console.error(
      `Invalid migration filename "${file}". Use 0001_lowercase_name.sql.`
    );
    process.exit(1);
  }
}

const appliedVersions = new Set(
  runPsql([
    "--tuples-only",
    "--no-align",
    "--command",
    "SELECT version FROM schema_migrations ORDER BY version;",
  ])
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
);

if (command === "status") {
  if (migrationFiles.length === 0) {
    console.log("No migration files found.");
    process.exit(0);
  }

  for (const file of migrationFiles) {
    const version = file.slice(0, -4);
    console.log(`${appliedVersions.has(version) ? "applied" : "pending"}  ${version}`);
  }
  process.exit(0);
}

if (command === "verify") {
  runPsql([
    "--command",
    `DO $$
    BEGIN
      IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Missing table: users';
      END IF;
      IF to_regclass('public.recordings') IS NULL THEN
        RAISE EXCEPTION 'Missing table: recordings';
      END IF;
      IF to_regclass('public.studio_presets') IS NULL THEN
        RAISE EXCEPTION 'Missing table: studio_presets';
      END IF;
      IF to_regclass('public.recording_shares') IS NULL THEN
        RAISE EXCEPTION 'Missing table: recording_shares';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recordings'
          AND column_name = 'user_id'
          AND is_nullable = 'NO'
      ) THEN
        RAISE EXCEPTION 'Missing required column: recordings.user_id';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recordings'
          AND column_name = 'is_public'
          AND is_nullable = 'NO'
      ) THEN
        RAISE EXCEPTION 'Missing required column: recordings.is_public';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'studio_presets'
          AND column_name = 'user_id'
          AND is_nullable = 'NO'
      ) THEN
        RAISE EXCEPTION 'Missing required column: studio_presets.user_id';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'recordings'::regclass
          AND contype = 'f'
          AND conname = 'recordings_user_id_fkey'
      ) THEN
        RAISE EXCEPTION 'Missing foreign key: recordings_user_id_fkey';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'studio_presets'::regclass
          AND contype = 'f'
          AND conname = 'studio_presets_user_id_fkey'
      ) THEN
        RAISE EXCEPTION 'Missing foreign key: studio_presets_user_id_fkey';
      END IF;
    END
    $$;`,
  ]);
  console.log("Database schema verified.");
  process.exit(0);
}

if (command !== "migrate") {
  console.error(`Unknown command "${command}". Use migrate, status, or verify.`);
  process.exit(1);
}

let appliedCount = 0;

for (const file of migrationFiles) {
  const version = file.slice(0, -4);
  if (appliedVersions.has(version)) continue;

  const migrationPath = join(migrationsDirectory, file).replaceAll("'", "''");
  const versionLiteral = version.replaceAll("'", "''");
  const input = `\\i '${migrationPath}'\nINSERT INTO schema_migrations (version) VALUES ('${versionLiteral}');\n`;

  console.log(`Applying ${version}...`);
  runPsql(["--single-transaction", "--file=-"], { input });
  console.log(`Applied ${version}.`);
  appliedCount += 1;
}

if (appliedCount === 0) {
  console.log("Database is already up to date.");
} else {
  console.log(`Applied ${appliedCount} migration(s).`);
}
