import { describe, it, expect, vi } from 'vitest';
import worker, {
  CRON_JOB_MAP,
  getJobNameForCron,
  dispatchTick,
  validateWorkerConfig,
  DEFAULT_TICK_TIMEOUT_MS,
  MIN_TICK_TIMEOUT_MS,
  MAX_TICK_TIMEOUT_MS,
  Env,
} from '../src/index.js';

describe('Cloudflare Worker Scheduler Spike', () => {
  const env: Env = {
    APP_URL: 'https://mock-app.internal',
    TICK_SECRET: 'test-bearer-secret-xyz',
    TICK_TIMEOUT_MS: '5000',
  };

  describe('Authoritative Schedule Mapping', () => {
    it('maps all 5 authoritative UTC cron schedules to exact job kinds', () => {
      expect(getJobNameForCron('30 16 * * *')).toBe('reminder');
      expect(getJobNameForCron('30 17 * * *')).toBe('cutoff');
      expect(getJobNameForCron('40 17 * * *')).toBe('cutoff_retry');
      expect(getJobNameForCron('30 3 * * *')).toBe('recovery');
      expect(getJobNameForCron('20 4 * * *')).toBe('recovery_retry');
    });

    it('does NOT recognize or schedule menu locking, automatic delivery, or 10:00 recovery', () => {
      expect(getJobNameForCron('0 18 * * *')).toBeUndefined(); // 18:00 IST menu lock is server-computed
      expect(getJobNameForCron('0 13 * * *')).toBeUndefined(); // 13:00 IST delivery is manual
      expect(getJobNameForCron('0 10 * * *')).toBeUndefined(); // 10:00 IST is the recovery cutoff, not a job
      expect(getJobNameForCron('* * * * *')).toBeUndefined();
    });
  });

  describe('Tick Dispatching, Identity Preservation & Retry Policy', () => {
    const SCHEDULED_TIME = 1794763800000; // Fixed timestamp
    const EXPECTED_ISO = new Date(SCHEDULED_TIME).toISOString();

    it('fails safely when TICK_SECRET configuration is missing', async () => {
      const result = await dispatchTick('cutoff', SCHEDULED_TIME, { APP_URL: 'http://localhost' });
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.message).toContain('TICK_SECRET configuration missing');
    });

    it('fails safely when APP_URL configuration is missing without defaulting to localhost (R3)', async () => {
      const result = await dispatchTick('cutoff', SCHEDULED_TIME, { TICK_SECRET: 'secret' });
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.message).toContain('APP_URL configuration missing');
    });

    it('dispatches authenticated POST, verifies receipt format and preserves scheduled_for identity', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'recorded',
            job_name: 'cutoff',
            scheduled_for: EXPECTED_ISO,
            duplicate: false,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, mockFetch as unknown as typeof fetch);

      expect(result.success).toBe(true);
      expect(result.job_name).toBe('cutoff');
      expect(result.scheduled_for).toBe(EXPECTED_ISO);
      expect(result.attempts).toBe(1);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://mock-app.internal/internal/tick');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${env.TICK_SECRET}`);
      expect(init.redirect).toBe('error');
      expect(JSON.parse(init.body as string)).toEqual({
        job_name: 'cutoff',
        scheduled_for: EXPECTED_ISO,
      });
    });

    it('retries on 5xx transient server error with identical invocation identity', async () => {
      const mockFetch = vi
        .fn()
        // Attempt 1: 500 error (sleeping service or temporary failure)
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        // Attempt 2: 200 success with valid matching receipt
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'recorded',
              job_name: 'reminder',
              scheduled_for: EXPECTED_ISO,
              duplicate: false,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );

      const result = await dispatchTick('reminder', SCHEDULED_TIME, env, mockFetch as unknown as typeof fetch);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify invocation identity is preserved exactly across attempt 1 and 2
      const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
      const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body1.scheduled_for).toBe(EXPECTED_ISO);
      expect(body2.scheduled_for).toBe(EXPECTED_ISO);
    });

    it('does NOT retry client authentication (401/403) or validation (400) failures', async () => {
      const mockFetch401 = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
      const result401 = await dispatchTick('cutoff', SCHEDULED_TIME, env, mockFetch401 as unknown as typeof fetch);
      expect(result401.success).toBe(false);
      expect(result401.attempts).toBe(1); // Halts on attempt 1
      expect(mockFetch401).toHaveBeenCalledTimes(1);

      const mockFetch400 = vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 }));
      const result400 = await dispatchTick('cutoff', SCHEDULED_TIME, env, mockFetch400 as unknown as typeof fetch);
      expect(result400.success).toBe(false);
      expect(result400.attempts).toBe(1); // Halts on attempt 1
      expect(mockFetch400).toHaveBeenCalledTimes(1);
    });
  });

  describe('Worker Timeouts & Success Validation (R3)', () => {
    const SCHEDULED_TIME = 1794763800000;
    const EXPECTED_ISO = new Date(SCHEDULED_TIME).toISOString();

    it('aborts when initial fetch hangs beyond configured timeout', async () => {
      const hangingFetch = vi.fn().mockImplementation((_url, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new Error('The operation was aborted due to timeout'));
          });
        });
      });

      const fastEnv: Env = { ...env, TICK_TIMEOUT_MS: '25' };
      const result = await dispatchTick('cutoff', SCHEDULED_TIME, fastEnv, hangingFetch as unknown as typeof fetch);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // Retries on timeout/network failure
      expect(result.message).toContain('aborted');
    });

    it('keeps timeout protection active through response body reading', async () => {
      const stalledBodyFetch = vi.fn().mockImplementation((_url, init: RequestInit) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            new Promise<string>((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                reject(new Error('Body stream timed out'));
              });
            }),
        });
      });

      const fastEnv: Env = { ...env, TICK_TIMEOUT_MS: '25' };
      const result = await dispatchTick('cutoff', SCHEDULED_TIME, fastEnv, stalledBodyFetch as unknown as typeof fetch);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Body stream timed out');
    });

    it('rejects HTTP 200 response containing HTML (e.g. SPA fallback)', async () => {
      const htmlFetch = vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><html><body>QuickBite</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      );

      const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, htmlFetch as unknown as typeof fetch);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Response body is not valid JSON');
    });

    it('rejects HTTP 200 response containing malformed JSON', async () => {
      const malformedFetch = vi.fn().mockResolvedValue(
        new Response('{ "status": "recorded", incomplete', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, malformedFetch as unknown as typeof fetch);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Response body is not valid JSON');
    });

    it('rejects HTTP 200 response when receipt status is not "recorded"', async () => {
      const wrongStatusFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed', // Invalid: tick webhook only records, never completes
            job_name: 'cutoff',
            scheduled_for: EXPECTED_ISO,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, wrongStatusFetch as unknown as typeof fetch);

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not match "recorded"');
    });

    it('rejects HTTP 200 response when receipt job_name or scheduled_for does not match requested', async () => {
      const mismatchedJobFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'recorded',
            job_name: 'reminder', // Requested 'cutoff'
            scheduled_for: EXPECTED_ISO,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, mismatchedJobFetch as unknown as typeof fetch);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Receipt job_name "reminder" does not match requested "cutoff"');
    });
  });

  describe('Public HTTP Security (R1)', () => {
    it('proves public POST /trigger is removed and cannot trigger outbound dispatch', async () => {
      const globalFetchSpy = vi.spyOn(globalThis, 'fetch');
      const req = new Request('http://worker.internal/trigger', { method: 'POST' });
      const res = await worker.fetch(req, env);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({ error: 'Not Found' });
      expect(globalFetchSpy).not.toHaveBeenCalled();
      globalFetchSpy.mockRestore();
    });
  });

  describe('Worker Configuration & Receipt Hardening (F4)', () => {
    const SCHEDULED_TIME = 1794763800000;
    const EXPECTED_ISO = new Date(SCHEDULED_TIME).toISOString();

    describe('validateWorkerConfig', () => {
      it('validates a correct HTTPS configuration and applies default 90-second timeout', () => {
        const result = validateWorkerConfig({
          APP_URL: 'https://api.quickbite.example.com',
          TICK_SECRET: 'super-secret',
        });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.config.appUrl).toBe('https://api.quickbite.example.com');
          expect(result.config.tickSecret).toBe('super-secret');
          expect(result.config.timeoutMs).toBe(DEFAULT_TICK_TIMEOUT_MS);
          expect(result.config.timeoutMs).toBe(90000);
        }
      });

      it('permits HTTP for localhost and loopback development', () => {
        const local1 = validateWorkerConfig({
          APP_URL: 'http://localhost:3000',
          TICK_SECRET: 'secret',
        });
        expect(local1.valid).toBe(true);

        const local2 = validateWorkerConfig({
          APP_URL: 'http://127.0.0.1:3001',
          TICK_SECRET: 'secret',
        });
        expect(local2.valid).toBe(true);

        const local3 = validateWorkerConfig({
          APP_URL: 'http://[::1]:3000',
          TICK_SECRET: 'secret',
        });
        expect(local3.valid).toBe(true);
      });

      it('rejects remote HTTP to prevent sending bearer secret over unencrypted connections', () => {
        const result = validateWorkerConfig({
          APP_URL: 'http://api.quickbite.example.com',
          TICK_SECRET: 'secret',
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('must use HTTPS protocol for remote deployments');
        }
      });

      it('rejects URLs containing embedded credentials', () => {
        const result = validateWorkerConfig({
          APP_URL: 'https://user:password@quickbite.example.com',
          TICK_SECRET: 'secret',
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('embedded credentials');
        }
      });

      it('rejects URLs containing query parameters or fragments', () => {
        const queryRes = validateWorkerConfig({
          APP_URL: 'https://quickbite.example.com?query=val',
          TICK_SECRET: 'secret',
        });
        expect(queryRes.valid).toBe(false);
        if (!queryRes.valid) {
          expect(queryRes.error).toContain('query parameters');
        }

        const hashRes = validateWorkerConfig({
          APP_URL: 'https://quickbite.example.com#section',
          TICK_SECRET: 'secret',
        });
        expect(hashRes.valid).toBe(false);
        if (!hashRes.valid) {
          expect(hashRes.error).toContain('URL fragments');
        }
      });

      it('rejects URLs containing non-root path components', () => {
        const pathRes = validateWorkerConfig({
          APP_URL: 'https://quickbite.example.com/api/v1',
          TICK_SECRET: 'secret',
        });
        expect(pathRes.valid).toBe(false);
        if (!pathRes.valid) {
          expect(pathRes.error).toContain('pure origin without path components');
        }
      });

      it('rejects malformed URLs', () => {
        const malformedRes = validateWorkerConfig({
          APP_URL: 'not a valid url',
          TICK_SECRET: 'secret',
        });
        expect(malformedRes.valid).toBe(false);
        if (!malformedRes.valid) {
          expect(malformedRes.error).toContain('not a valid URL');
        }
      });

      it('rejects non-numeric, zero, negative, or overflow TICK_TIMEOUT_MS', () => {
        // Non-numeric
        expect(validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: 'abc' }).valid).toBe(false);
        expect(validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '12.34' }).valid).toBe(false);

        // Zero and negative
        expect(validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '0' }).valid).toBe(false);
        expect(validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '-5000' }).valid).toBe(false);

        // Overflow (> 120,000 ms)
        expect(validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '120001' }).valid).toBe(false);
        expect(validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '999999999' }).valid).toBe(false);

        // Valid bounded values
        const valid1 = validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '1' });
        expect(valid1.valid).toBe(true);
        if (valid1.valid) expect(valid1.config.timeoutMs).toBe(1);

        const validMax = validateWorkerConfig({ APP_URL: 'https://example.com', TICK_SECRET: 's', TICK_TIMEOUT_MS: '120000' });
        expect(validMax.valid).toBe(true);
        if (validMax.valid) expect(validMax.config.timeoutMs).toBe(120000);
      });
    });

    describe('dispatchTick with invalid configuration causes zero outbound fetches', () => {
      it('causes zero outbound fetches on remote HTTP APP_URL', async () => {
        const mockFetch = vi.fn();
        const badEnv: Env = {
          APP_URL: 'http://insecure-remote.example.com',
          TICK_SECRET: 'secret',
        };
        const result = await dispatchTick('cutoff', SCHEDULED_TIME, badEnv, mockFetch as unknown as typeof fetch);

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(0);
        expect(result.message).toContain('HTTPS');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('causes zero outbound fetches on credentials in APP_URL', async () => {
        const mockFetch = vi.fn();
        const badEnv: Env = {
          APP_URL: 'https://user:pass@example.com',
          TICK_SECRET: 'secret',
        };
        const result = await dispatchTick('cutoff', SCHEDULED_TIME, badEnv, mockFetch as unknown as typeof fetch);

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(0);
        expect(result.message).toContain('embedded credentials');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('causes zero outbound fetches on invalid TICK_TIMEOUT_MS (zero, negative, huge, non-numeric)', async () => {
        const mockFetch = vi.fn();

        for (const badTimeout of ['0', '-1000', 'invalid', '999999999']) {
          const badEnv: Env = {
            APP_URL: 'https://example.com',
            TICK_SECRET: 'secret',
            TICK_TIMEOUT_MS: badTimeout,
          };
          const result = await dispatchTick('cutoff', SCHEDULED_TIME, badEnv, mockFetch as unknown as typeof fetch);

          expect(result.success).toBe(false);
          expect(result.attempts).toBe(0);
          expect(result.message).toContain('Invalid TICK_TIMEOUT_MS');
          expect(mockFetch).not.toHaveBeenCalled();
        }
      });
    });

    describe('Receipt JSON hardening against null, array, and non-object responses', () => {
      it('rejects HTTP 200 response when parsed JSON is null without throwing', async () => {
        const nullFetch = vi.fn().mockResolvedValue(
          new Response('null', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );

        const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, nullFetch as unknown as typeof fetch);

        expect(result.success).toBe(false);
        expect(result.message).toContain('not a valid receipt object');
      });

      it('rejects HTTP 200 response when parsed JSON is an array without throwing', async () => {
        const arrayFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify([{ status: 'recorded', job_name: 'cutoff' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );

        const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, arrayFetch as unknown as typeof fetch);

        expect(result.success).toBe(false);
        expect(result.message).toContain('not a valid receipt object');
      });

      it('rejects HTTP 200 response when parsed JSON is a primitive number or boolean', async () => {
        const primitiveFetch = vi.fn().mockResolvedValue(
          new Response('42', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );

        const result = await dispatchTick('cutoff', SCHEDULED_TIME, env, primitiveFetch as unknown as typeof fetch);

        expect(result.success).toBe(false);
        expect(result.message).toContain('not a valid receipt object');
      });
    });
  });
});
