import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import { createApp } from '../src/app.js';
import * as poolModule from '../src/db/pool.js';
import { clearReadyzCache } from '../src/routes/health.js';
import { config } from '../src/config.js';

describe('GET /livez (Process Liveness)', () => {
  it('returns 200 OK without accessing the database', async () => {
    // Spy on getPool to ensure zero DB calls are made
    const getPoolSpy = vi.spyOn(poolModule, 'getPool');

    const app = createApp();
    const res = await request(app).get('/livez');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(getPoolSpy).not.toHaveBeenCalled();

    getPoolSpy.mockRestore();
  });
});

describe('GET /readyz (Database Readiness) & Bounds (R5, R6, F3)', () => {
  beforeEach(() => {
    clearReadyzCache();
    vi.restoreAllMocks();
  });

  it('returns 503 when DATABASE_URL is not configured', async () => {
    const originalUrl = config.databaseUrl;
    config.databaseUrl = undefined;

    const app = createApp();
    const res = await request(app).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.error).toBe('Database is not configured');

    config.databaseUrl = originalUrl;
  });

  it('returns 200 when database connectivity check succeeds', async () => {
    const originalUrl = config.databaseUrl;
    config.databaseUrl = 'postgresql://mock:mock@localhost:5432/mock';

    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ readiness: 1 }] });
    vi.spyOn(poolModule, 'getPool').mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof poolModule.getPool>);

    const app = createApp();
    const res = await request(app).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.cached).toBe(false);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(mockQuery).toHaveBeenCalledTimes(1);

    config.databaseUrl = originalUrl;
  });

  it('caches readiness result for 30 seconds to prevent DB wakeups', async () => {
    const originalUrl = config.databaseUrl;
    config.databaseUrl = 'postgresql://mock:mock@localhost:5432/mock';

    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ readiness: 1 }] });
    vi.spyOn(poolModule, 'getPool').mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof poolModule.getPool>);

    const app = createApp();

    // First request - Cache MISS
    const res1 = await request(app).get('/readyz');
    expect(res1.status).toBe(200);
    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.cached).toBe(false);

    // Second request within TTL - Cache HIT
    const res2 = await request(app).get('/readyz');
    expect(res2.status).toBe(200);
    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body.cached).toBe(true);

    // DB query should have only been executed once
    expect(mockQuery).toHaveBeenCalledTimes(1);

    config.databaseUrl = originalUrl;
  });

  it('deduplicates concurrent uncached /readyz requests so only one DB query is launched (R5)', async () => {
    const originalUrl = config.databaseUrl;
    config.databaseUrl = 'postgresql://mock:mock@localhost:5432/mock';

    // Mock query with a slight delay simulating real network transit
    let queryCallCount = 0;
    const mockQuery = vi.fn().mockImplementation(() => {
      queryCallCount++;
      return new Promise((resolve) => setTimeout(() => resolve({ rows: [{ readiness: 1 }] }), 20));
    });

    vi.spyOn(poolModule, 'getPool').mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof poolModule.getPool>);

    const app = createApp();

    // Fire 3 simultaneous requests while cache is empty
    const [res1, res2, res3] = await Promise.all([
      request(app).get('/readyz'),
      request(app).get('/readyz'),
      request(app).get('/readyz'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // In-flight deduplication must ensure only 1 query was executed
    expect(queryCallCount).toBe(1);

    config.databaseUrl = originalUrl;
  });

  it('sanitizes error responses and returns 503 without leaking connection strings or credentials', async () => {
    const originalUrl = config.databaseUrl;
    config.databaseUrl = 'postgresql://secret_user:super_secret_password@db.example.com/db';

    // Mock query rejecting with an error containing sensitive internal connection details
    const sensitiveError = new Error('Connection refused to db.example.com:5432 with password super_secret_password');
    vi.spyOn(poolModule, 'getPool').mockReturnValue({
      query: vi.fn().mockRejectedValue(sensitiveError),
    } as unknown as ReturnType<typeof poolModule.getPool>);

    const app = createApp();
    const res = await request(app).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.error).toBe('Database readiness check failed');
    expect(JSON.stringify(res.body)).not.toContain('super_secret_password');
    expect(JSON.stringify(res.body)).not.toContain('secret_user');

    config.databaseUrl = originalUrl;
  });

  it('applies statement_timeout and query_timeout in createPoolConfig (R5)', () => {
    const poolConfig = poolModule.createPoolConfig('postgresql://user:pass@localhost:5432/quickbite');
    expect(poolConfig.statement_timeout).toBe(config.dbQueryTimeoutMs);
    expect(poolConfig.query_timeout).toBe(config.dbQueryTimeoutMs);
    expect(poolConfig.connectionTimeoutMillis).toBe(config.dbConnectTimeoutMs);
    expect(poolConfig.idleTimeoutMillis).toBe(config.dbIdleTimeoutMs);
  });

  it('enforces certificate verification without rejectUnauthorized: false on remote databases (R6)', () => {
    // Localhost without sslmode should have no ssl config
    const localConfig = poolModule.createPoolConfig('postgresql://user:pass@localhost:5432/quickbite');
    expect(localConfig.ssl).toBeUndefined();

    // Remote Neon URL must require valid certificates
    const neonConfig = poolModule.createPoolConfig('postgresql://user:pass@ep-cool-sample.us-east-2.aws.neon.tech/quickbite?sslmode=require');
    expect(neonConfig.ssl).toEqual({ rejectUnauthorized: true });
    // Must NOT disable certificate validation
    expect((neonConfig.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(false);
  });

  describe('PostgreSQL Driver Effective TLS Verification (F3)', () => {
    it('guarantees pg.Client effective connectionParameters.ssl enforces rejectUnauthorized: true for remote hosts', () => {
      const poolConfig = poolModule.createPoolConfig('postgresql://user:pass@ep-cool-sample.us-east-2.aws.neon.tech/quickbite?sslmode=require');
      const client = new Client(poolConfig);
      // F3: Inspect effective client connection parameters
      expect(client.connectionParameters.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('rejects insecure sslmode settings (no-verify, disable) for remote database URLs', () => {
      expect(() => {
        poolModule.createPoolConfig('postgresql://user:pass@ep-cool-sample.us-east-2.aws.neon.tech/quickbite?sslmode=no-verify');
      }).toThrow(/Insecure sslmode "no-verify" is rejected/);

      expect(() => {
        poolModule.createPoolConfig('postgresql://user:pass@ep-cool-sample.us-east-2.aws.neon.tech/quickbite?sslmode=disable');
      }).toThrow(/Insecure sslmode "disable" is rejected/);
    });

    it('retains permitted local development behavior on localhost without TLS', () => {
      const localConfig = poolModule.createPoolConfig('postgresql://user:pass@localhost:5432/quickbite_dev');
      const client = new Client(localConfig);
      // Local development without SSL remains false/undefined in pg.Client
      expect(client.connectionParameters.ssl).toBeFalsy();
    });
  });
});
