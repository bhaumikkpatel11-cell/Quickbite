import { Pool, PoolConfig } from 'pg';
import { config } from '../config.js';

let poolInstance: Pool | null = null;

/**
 * Classifies whether a parsed hostname is a local loopback address.
 * F3: Classifies local vs remote using parsed hostname rather than substring presence alone.
 */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.localhost')
  );
}

/**
 * Creates pg.PoolConfig with strictly verified TLS for remote hosts.
 * F3: Normalizes connection-string SSL query parameters so pg driver parsing cannot override
 * the explicit verified TLS configuration. Insecure settings (no-verify, disable) for remote hosts
 * are explicitly rejected.
 */
export function createPoolConfig(databaseUrl?: string): PoolConfig {
  const rawUrl = databaseUrl || config.databaseUrl;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  const hostname = parsed.hostname;
  const isRemote = !isLocalHost(hostname);
  const sslmode = (parsed.searchParams.get('sslmode') || '').toLowerCase();

  if (isRemote) {
    // Explicitly reject insecure SSL settings for remote hosts (F3)
    if (sslmode === 'disable' || sslmode === 'no-verify' || sslmode === 'allow' || sslmode === 'prefer') {
      throw new Error(
        `Insecure sslmode "${sslmode}" is rejected for remote database host "${hostname}". Remote connections must verify TLS certificates.`
      );
    }

    // Normalize connection string by stripping sslmode query params so pg-connection-string
    // cannot conflict with or override our explicit verified TLS configuration.
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');

    return {
      connectionString: parsed.toString(),
      connectionTimeoutMillis: config.dbConnectTimeoutMs,
      idleTimeoutMillis: config.dbIdleTimeoutMs,
      max: config.dbMaxConnections,
      statement_timeout: config.dbQueryTimeoutMs,
      query_timeout: config.dbQueryTimeoutMs,
      ssl: { rejectUnauthorized: true },
    };
  }

  // Explicit local development host (localhost / 127.0.0.1)
  const localSsl = sslmode === 'require' || sslmode === 'verify-full' ? { rejectUnauthorized: true } : undefined;
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('ssl');

  return {
    connectionString: parsed.toString(),
    connectionTimeoutMillis: config.dbConnectTimeoutMs,
    idleTimeoutMillis: config.dbIdleTimeoutMs,
    max: config.dbMaxConnections,
    statement_timeout: config.dbQueryTimeoutMs,
    query_timeout: config.dbQueryTimeoutMs,
    ssl: localSsl,
  };
}

export function getPool(overrideUrl?: string): Pool {
  if (overrideUrl) {
    return new Pool(createPoolConfig(overrideUrl));
  }
  if (!poolInstance) {
    poolInstance = new Pool(createPoolConfig());
    poolInstance.on('error', (err) => {
      // Do not crash the server on unexpected idle client errors
      console.error('Unexpected error on idle PostgreSQL client', err.message);
    });
  }
  return poolInstance;
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    const p = poolInstance;
    poolInstance = null;
    await p.end();
  }
}
