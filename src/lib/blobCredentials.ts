import 'server-only';

export type BlobClientUploadMethod = 'client-token' | 'presigned';

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured for this environment.`);
  return value;
}

export function getBlobClientUploadMethod(): BlobClientUploadMethod {
  return process.env.VERCEL_ENV === 'production' ? 'client-token' : 'presigned';
}

export function getBlobCommandCredentials() {
  if (getBlobClientUploadMethod() === 'client-token') {
    return {
      token: requireEnvironmentVariable('BLOB_READ_WRITE_TOKEN'),
    };
  }

  return {
    oidcToken: requireEnvironmentVariable('VERCEL_OIDC_TOKEN'),
    storeId: requireEnvironmentVariable('BLOB_STORE_ID'),
  };
}

export function getBlobWebhookPublicKey(): string {
  return requireEnvironmentVariable('BLOB_WEBHOOK_PUBLIC_KEY');
}

export function isBlobStorageConfigured(): boolean {
  if (getBlobClientUploadMethod() === 'client-token') {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  return Boolean(
    process.env.VERCEL_OIDC_TOKEN
    && process.env.BLOB_STORE_ID
    && process.env.BLOB_WEBHOOK_PUBLIC_KEY
  );
}
