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

function getOidcToken(request?: Request): string | undefined {
  return request?.headers.get('x-vercel-oidc-token')
    ?? process.env.VERCEL_OIDC_TOKEN;
}

export function getBlobCommandCredentials(request?: Request) {
  if (getBlobClientUploadMethod() === 'client-token') {
    return {
      token: requireEnvironmentVariable('BLOB_READ_WRITE_TOKEN'),
    };
  }

  return {
    oidcToken: getOidcToken(request)
      ?? requireEnvironmentVariable('VERCEL_OIDC_TOKEN'),
    storeId: requireEnvironmentVariable('BLOB_STORE_ID'),
  };
}

export function getBlobWebhookPublicKey(): string {
  return requireEnvironmentVariable('BLOB_WEBHOOK_PUBLIC_KEY');
}

export function isBlobStorageConfigured(request?: Request): boolean {
  if (getBlobClientUploadMethod() === 'client-token') {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  return Boolean(
    getOidcToken(request)
    && process.env.BLOB_STORE_ID
    && process.env.BLOB_WEBHOOK_PUBLIC_KEY
  );
}
