import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as poolModule from '../src/db/pool.js';
import { config } from '../src/config.js';
import { safeCompareSecrets } from '../src/middleware/auth.js';

describe('Safe Secret Comparison', () => {
  it('returns true for matching secrets', () => {
    expect(safeCompareSecrets('correct-secret-12345', 'correct-secret-12345')).toBe(true);
  });

  it('returns false for mismatched secrets of same length', () => {
    expect(safeCompareSecrets('wrong-secret-1234567', 'correct-secret-12345')).toBe(false);
  });

  it('returns false for mismatched secrets of different lengths without throwing', () => {
    expect(safeCompareSecrets('short', 'much-longer-secret-value')).toBe(false);
    expect(safeCompareSecrets('much-longer-secret-value', 'short')).toBe(false);
  });

  it('handles empty strings safely', () => {
    expect(safeCompareSecrets('', 'secret')).toBe(false);
    expect(safeCompareSecrets('secret', '')).toBe(false);
    expect(safeCompareSecrets('', '')).toBe(false);
  });
});

describe('POST /internal/tick (Authentication & Validation)', () => {
  const TEST_SECRET = 'test_tick_secret_abcdef123456';
  const VALID_SCHEDULED_TIME = '2026-11-15T17:30:00.000Z';

  beforeEach(() => {
    config.tickSecret = TEST_SECRET;
    vi.restoreAllMocks();
  });

  describe('Authentication Guardrails', () => {
    it('returns 500 when server TICK_SECRET configuration is missing', async () => {
      config.tickSecret = undefined;

      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({ job_name: 'cutoff', scheduled_for: VALID_SCHEDULED_TIME });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Server authentication configuration is missing');
    });

    it('returns 401 when Authorization header is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .send({ job_name: 'cutoff', scheduled_for: VALID_SCHEDULED_TIME });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Missing Authorization header');
    });

    it('returns 401 when Authorization scheme is not Bearer', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .set('Authorization', `Basic ${TEST_SECRET}`)
        .send({ job_name: 'cutoff', scheduled_for: VALID_SCHEDULED_TIME });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Malformed Authorization header');
    });

    it('returns 401 when Bearer token is incorrect', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .set('Authorization', 'Bearer invalid_wrong_token')
        .send({ job_name: 'cutoff', scheduled_for: VALID_SCHEDULED_TIME });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid tick credentials');
    });
  });

  describe('Payload Validation', () => {
    it('rejects invalid job names (e.g. menu_lock or arbitrary strings)', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({ job_name: 'menu_lock', scheduled_for: VALID_SCHEDULED_TIME });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid tick request payload');
      expect(res.body.details.job_name[0]).toContain('Invalid job_name');
    });

    it('rejects missing or invalid scheduled_for timestamps', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({ job_name: 'cutoff', scheduled_for: 'not-a-timestamp' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid tick request payload');
      expect(res.body.details.scheduled_for[0]).toContain('valid ISO 8601');
    });

    it('accepts all 5 authoritative job kinds with valid ISO timestamp', async () => {
      const allowedJobs = ['reminder', 'cutoff', 'cutoff_retry', 'recovery', 'recovery_retry'];

      for (const job of allowedJobs) {
        const mockQuery = vi.fn().mockResolvedValue({
          rows: [
            {
              id: 1,
              job_name: job,
              scheduled_for: VALID_SCHEDULED_TIME,
              executed_at: new Date().toISOString(),
              status: 'recorded',
            },
          ],
        });

        vi.spyOn(poolModule, 'getPool').mockReturnValue({
          query: mockQuery,
        } as unknown as ReturnType<typeof poolModule.getPool>);

        const app = createApp();
        const res = await request(app)
          .post('/internal/tick')
          .set('Authorization', `Bearer ${TEST_SECRET}`)
          .send({ job_name: job, scheduled_for: VALID_SCHEDULED_TIME });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('recorded'); // NOT 'completed'
        expect(res.body.job_name).toBe(job);
        expect(res.body.duplicate).toBe(false);
      }
    });

    it('handles idempotent duplicate tick delivery returning 200 with duplicate=true', async () => {
      // Simulate ON CONFLICT DO NOTHING (rows.length === 0 on insert, row found on select)
      const mockQuery = vi
        .fn()
        // First query: INSERT ON CONFLICT DO NOTHING -> 0 rows inserted
        .mockResolvedValueOnce({ rows: [] })
        // Second query: SELECT existing row
        .mockResolvedValueOnce({
          rows: [
            {
              id: 42,
              job_name: 'cutoff',
              scheduled_for: VALID_SCHEDULED_TIME,
              executed_at: new Date().toISOString(),
              status: 'recorded',
            },
          ],
        });

      vi.spyOn(poolModule, 'getPool').mockReturnValue({
        query: mockQuery,
      } as unknown as ReturnType<typeof poolModule.getPool>);

      const app = createApp();
      const res = await request(app)
        .post('/internal/tick')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send({ job_name: 'cutoff', scheduled_for: VALID_SCHEDULED_TIME });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('recorded');
      expect(res.body.duplicate).toBe(true);
      expect(res.body.receipt_id).toBe(42);
    });
  });
});
