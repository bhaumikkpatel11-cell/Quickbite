import { Router, Request, Response } from 'express';
import { getPool } from '../db/pool.js';
import { config } from '../config.js';

export const healthRouter = Router();

interface ReadyzBody {
  status: string;
  checked_at: string;
  cached: boolean;
  error?: string;
}

interface ReadyzResponse {
  statusCode: number;
  body: ReadyzBody;
}

let cachedReadyz: { timestamp: number; statusCode: number; body: ReadyzBody } | null = null;
let inFlightCheck: Promise<ReadyzResponse> | null = null;

// Exported for testing cache and in-flight deduplication behavior
export function clearReadyzCache(): void {
  cachedReadyz = null;
  inFlightCheck = null;
}

/**
 * GET /livez
 * Process liveness endpoint. Makes ZERO database calls.
 * Used exclusively by platform health pingers (e.g. Render).
 */
healthRouter.get('/livez', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Executes a bounded database connectivity query.
 * Statement and client timeouts are applied at the pool level, and a local race timer
 * guarantees bounded HTTP response time with cleared timer handles.
 */
async function performDbCheck(): Promise<ReadyzResponse> {
  const now = Date.now();

  if (!config.databaseUrl) {
    return {
      statusCode: 503,
      body: {
        status: 'not_ready',
        checked_at: new Date(now).toISOString(),
        cached: false,
        error: 'Database is not configured',
      },
    };
  }

  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    const pool = getPool();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Database check timed out'));
      }, config.dbQueryTimeoutMs);
    });

    const queryPromise = pool.query('SELECT 1 AS readiness');
    await Promise.race([queryPromise, timeoutPromise]);

    return {
      statusCode: 200,
      body: {
        status: 'ready',
        checked_at: new Date(now).toISOString(),
        cached: false,
      },
    };
  } catch (err) {
    return {
      statusCode: 503,
      body: {
        status: 'not_ready',
        checked_at: new Date(now).toISOString(),
        cached: false,
        error: 'Database readiness check failed',
      },
    };
  } finally {
    // R5: Clear timeout handle so timers do not leak or keep event loop open
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * GET /readyz
 * Bounded database readiness check.
 *
 * ARCHITECTURAL CONSTRAINT & DOCUMENTATION (R5):
 * Readiness caching (30s TTL) reduces database queries to at most one per window and
 * in-flight request deduplication prevents concurrent query storms.
 * However, caching DOES NOT GUARANTEE that the database will scale to zero / suspend
 * if an external pinger polls /readyz periodically (e.g. every 2–4 minutes).
 * Platform monitors (Render health check, uptime monitors) MUST poll /livez exclusively,
 * which never touches PostgreSQL.
 */
healthRouter.get('/readyz', async (_req: Request, res: Response) => {
  const now = Date.now();

  // Return cached result if still fresh
  if (cachedReadyz && now - cachedReadyz.timestamp < config.readyzCacheTtlMs) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Cache-Control', 'no-store');
    res.status(cachedReadyz.statusCode).json({
      ...cachedReadyz.body,
      cached: true,
    });
    return;
  }

  // R5: Deduplicate concurrent uncached requests to prevent launching redundant queries
  if (!inFlightCheck) {
    inFlightCheck = performDbCheck().finally(() => {
      inFlightCheck = null;
    });
  }

  const result = await inFlightCheck;
  cachedReadyz = {
    timestamp: now,
    statusCode: result.statusCode,
    body: result.body,
  };

  res.setHeader('X-Cache', 'MISS');
  res.setHeader('Cache-Control', 'no-store');
  res.status(result.statusCode).json(result.body);
});
