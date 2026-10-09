import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

/**
 * Returns a Neon SQL execution instance if DATABASE_URL is configured.
 * Safely throws an informative error if called without credentials.
 */
export function getDb() {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not defined. Please add it to your .env.local file or Vercel environment variables.'
    );
  }
  return neon(databaseUrl);
}

export const isDbConfigured = Boolean(databaseUrl);
