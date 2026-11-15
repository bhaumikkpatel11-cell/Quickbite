import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { authenticateTick } from '../middleware/auth.js';

export const tickRouter = Router();

// Allowed scheduler jobs according to authoritative architecture and Cloudflare cron mapping
export const ALLOWED_JOBS = [
  'reminder',
  'cutoff',
  'cutoff_retry',
  'recovery',
  'recovery_retry',
] as const;

export type AllowedJob = (typeof ALLOWED_JOBS)[number];

const tickPayloadSchema = z.object({
  job_name: z.enum(ALLOWED_JOBS, {
    errorMap: () => ({
      message: `Invalid job_name. Allowed jobs: ${ALLOWED_JOBS.join(', ')}`,
    }),
  }),
  scheduled_for: z.string().datetime({
    message: 'scheduled_for must be a valid ISO 8601 UTC timestamp',
  }),
  details: z.record(z.unknown()).optional(),
});

/**
 * POST /internal/tick
 *
 * Authenticated scheduler webhook invoked by Cloudflare Worker.
 *
 * Design constraints:
 * 1. Authenticated via constant-time Bearer secret comparison.
 * 2. Idempotent: (job_name, scheduled_for) is unique; repeated deliveries succeed safely.
 * 3. Does NOT execute business meal processing in M1A; records a durable tick receipt only.
 * 4. Status is recorded as 'recorded', never 'completed'.
 * 5. Server clock is NOT overridden by the client timestamp.
 */
tickRouter.post('/internal/tick', authenticateTick, async (req: Request, res: Response) => {
  const parseResult = tickPayloadSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid tick request payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { job_name, scheduled_for, details } = parseResult.data;

  try {
    const pool = getPool();

    // Insert receipt with ON CONFLICT DO NOTHING to handle concurrent or repeated ticks safely
    const insertQuery = `
      INSERT INTO scheduler_runs (job_name, scheduled_for, status, trigger_source, details)
      VALUES ($1, $2, 'recorded', 'cron', $3)
      ON CONFLICT (job_name, scheduled_for) DO NOTHING
      RETURNING id, job_name, scheduled_for, executed_at, status;
    `;

    const result = await pool.query(insertQuery, [
      job_name,
      scheduled_for,
      details ? JSON.stringify(details) : null,
    ]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      res.status(200).json({
        status: 'recorded',
        receipt_id: row.id,
        job_name: row.job_name,
        scheduled_for: row.scheduled_for,
        duplicate: false,
        message: 'Tick receipt recorded successfully',
      });
      return;
    }

    // Row already existed; fetch existing receipt to respond idempotently
    const existing = await pool.query(
      `SELECT id, job_name, scheduled_for, executed_at, status
       FROM scheduler_runs
       WHERE job_name = $1 AND scheduled_for = $2`,
      [job_name, scheduled_for]
    );

    const existingRow = existing.rows[0];
    res.status(200).json({
      status: 'recorded',
      receipt_id: existingRow?.id,
      job_name: existingRow?.job_name || job_name,
      scheduled_for: existingRow?.scheduled_for || scheduled_for,
      duplicate: true,
      message: 'Tick receipt already recorded (idempotent)',
    });
  } catch (err) {
    console.error('Error recording scheduler tick receipt:', (err as Error).message);
    res.status(500).json({
      error: 'Failed to record scheduler tick receipt',
    });
  }
});
