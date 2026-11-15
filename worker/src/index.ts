/**
 * QuickBite Cloudflare Worker Scheduler
 *
 * Invokes the modular monolith's authenticated POST /internal/tick endpoint
 * according to the 5 authoritative UTC cron schedules.
 */

export interface Env {
  APP_URL?: string;
  TICK_SECRET?: string;
  TICK_TIMEOUT_MS?: string;
}

export const DEFAULT_TICK_TIMEOUT_MS = 90000; // 90 seconds (suitable for Render container cold starts)
export const MIN_TICK_TIMEOUT_MS = 1; // 1 millisecond minimum
export const MAX_TICK_TIMEOUT_MS = 120000; // 2 minutes maximum (compatible with Worker invocation budget)

export interface ValidatedWorkerConfig {
  appUrl: string; // validated origin URL string without trailing slash
  tickSecret: string;
  timeoutMs: number;
}

/**
 * F4: Validates Worker deployment configuration before any network dispatch.
 * - APP_URL must be a valid origin (no credentials, no query, no hash, no path).
 * - Remote APP_URL requires HTTPS; localhost development permits HTTP or HTTPS.
 * - TICK_SECRET must be non-empty.
 * - TICK_TIMEOUT_MS must be a positive integer in [MIN_TICK_TIMEOUT_MS, MAX_TICK_TIMEOUT_MS].
 */
export function validateWorkerConfig(
  env: Env
): { valid: true; config: ValidatedWorkerConfig } | { valid: false; error: string } {
  const rawUrl = env.APP_URL?.trim();
  if (!rawUrl) {
    return { valid: false, error: 'APP_URL configuration missing' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { valid: false, error: `APP_URL "${rawUrl}" is not a valid URL` };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { valid: false, error: 'APP_URL must not contain embedded credentials' };
  }

  if (parsedUrl.search) {
    return { valid: false, error: 'APP_URL must not contain query parameters' };
  }

  if (parsedUrl.hash) {
    return { valid: false, error: 'APP_URL must not contain URL fragments' };
  }

  if (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') {
    return { valid: false, error: `APP_URL must be a pure origin without path components, received path "${parsedUrl.pathname}"` };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1';

  if (!isLocalhost && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: `APP_URL must use HTTPS protocol for remote deployments, received "${parsedUrl.protocol}"`,
    };
  }

  if (isLocalhost && parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: `APP_URL must use HTTP or HTTPS protocol, received "${parsedUrl.protocol}"`,
    };
  }

  const tickSecret = env.TICK_SECRET?.trim();
  if (!tickSecret) {
    return { valid: false, error: 'TICK_SECRET configuration missing' };
  }

  let timeoutMs = DEFAULT_TICK_TIMEOUT_MS;
  if (env.TICK_TIMEOUT_MS !== undefined && env.TICK_TIMEOUT_MS.trim() !== '') {
    const rawTimeout = env.TICK_TIMEOUT_MS.trim();
    if (!/^\d+$/.test(rawTimeout)) {
      return {
        valid: false,
        error: `Invalid TICK_TIMEOUT_MS: "${rawTimeout}". Must be a finite positive integer between ${MIN_TICK_TIMEOUT_MS} and ${MAX_TICK_TIMEOUT_MS} ms.`,
      };
    }

    const parsedTimeout = Number(rawTimeout);
    if (
      !Number.isSafeInteger(parsedTimeout) ||
      parsedTimeout < MIN_TICK_TIMEOUT_MS ||
      parsedTimeout > MAX_TICK_TIMEOUT_MS
    ) {
      return {
        valid: false,
        error: `Invalid TICK_TIMEOUT_MS: "${rawTimeout}". Must be between ${MIN_TICK_TIMEOUT_MS} and ${MAX_TICK_TIMEOUT_MS} ms.`,
      };
    }
    timeoutMs = parsedTimeout;
  }

  return {
    valid: true,
    config: {
      appUrl: parsedUrl.origin,
      tickSecret,
      timeoutMs,
    },
  };
}

export interface TickResult {
  job_name: string;
  scheduled_for: string;
  status?: number;
  success: boolean;
  attempts: number;
  message?: string;
  duplicate?: boolean;
  receipt_id?: string;
}

/**
 * Authoritative mapping of Cloudflare UTC cron expressions to internal job names.
 *
 * 1. 30 16 * * * -> 22:00 IST (reminder)
 * 2. 30 17 * * * -> 23:00 IST (cutoff)
 * 3. 40 17 * * * -> 23:10 IST (cutoff_retry)
 * 4. 30 3 * * *  -> 09:00 IST (recovery)
 * 5. 20 4 * * *  -> 09:50 IST (recovery_retry, final recovery before 10:00 IST)
 *
 * Note: Menu lock at 18:00 IST, delivery at 13:00 IST, and recovery at 10:00 IST
 * are NOT cron jobs.
 */
export const CRON_JOB_MAP: Record<string, string> = {
  '30 16 * * *': 'reminder',
  '30 17 * * *': 'cutoff',
  '40 17 * * *': 'cutoff_retry',
  '30 3 * * *': 'recovery',
  '20 4 * * *': 'recovery_retry',
};

export function getJobNameForCron(cronExpression: string): string | undefined {
  return CRON_JOB_MAP[cronExpression.trim()];
}

/**
 * Dispatches an authenticated tick to the server with bounded timeout and retries.
 * Preserves the exact scheduled_for instant across all retries.
 * Never logs secrets.
 */
export async function dispatchTick(
  jobName: string,
  scheduledTime: number,
  env: Env,
  fetchFn: typeof fetch = fetch
): Promise<TickResult> {
  const scheduledForIso = new Date(scheduledTime).toISOString();

  // F4 & R3: Validate Worker deployment configuration before any dispatch
  const validation = validateWorkerConfig(env);
  if (!validation.valid) {
    console.error(`[Scheduler] Configuration error for job ${jobName}: ${validation.error}`);
    return {
      job_name: jobName,
      scheduled_for: scheduledForIso,
      success: false,
      attempts: 0,
      message: validation.error,
    };
  }

  const { appUrl, tickSecret, timeoutMs } = validation.config;
  const endpoint = `${appUrl}/internal/tick`;
  const payload = JSON.stringify({
    job_name: jobName,
    scheduled_for: scheduledForIso,
  });

  const maxAttempts = 2; // Initial attempt + 1 retry
  let attempt = 0;
  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[Scheduler] Dispatching tick: job=${jobName} scheduled_for=${scheduledForIso} attempt=${attempt} timeout=${timeoutMs}ms`);

      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tickSecret}`,
        },
        body: payload,
        signal: controller.signal,
        redirect: 'error', // R3: Fail closed on unexpected redirects
      });

      lastStatus = response.status;

      // 4xx errors (e.g. 400 Bad Request, 401 Unauthorized) are client/auth errors; DO NOT RETRY
      if (response.status >= 400 && response.status < 500) {
        clearTimeout(timeoutId);
        console.warn(`[Scheduler] Non-retryable error received: status=${response.status} job=${jobName}`);
        return {
          job_name: jobName,
          scheduled_for: scheduledForIso,
          status: response.status,
          success: false,
          attempts: attempt,
          message: `Server returned non-retryable status ${response.status}`,
        };
      }

      // R3: Keep timeout protection active through response-body reading
      const responseText = await response.text();
      clearTimeout(timeoutId);

      if (!response.ok) {
        // 5xx Server Error: transient, allow retry
        console.warn(`[Scheduler] Server returned 5xx status=${response.status} job=${jobName}`);
        lastError = new Error(`Server returned status ${response.status}`);
      } else {
        // R3 & F4: Validate receipt response: must be non-null object, status must be "recorded", job name and scheduled timestamp must match
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          console.error(`[Scheduler] Response is not valid JSON for job=${jobName}`);
          return {
            job_name: jobName,
            scheduled_for: scheduledForIso,
            status: response.status,
            success: false,
            attempts: attempt,
            message: 'Response body is not valid JSON',
          };
        }

        // F4: Ensure response JSON is an object, not null or an array
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          console.error(`[Scheduler] Response JSON is not a valid receipt object for job=${jobName}`);
          return {
            job_name: jobName,
            scheduled_for: scheduledForIso,
            status: response.status,
            success: false,
            attempts: attempt,
            message: 'Response body is not a valid receipt object',
          };
        }

        const receipt = data as Record<string, unknown>;

        if (receipt.status !== 'recorded') {
          console.error(`[Scheduler] Receipt status is "${receipt.status}", expected "recorded" for job=${jobName}`);
          return {
            job_name: jobName,
            scheduled_for: scheduledForIso,
            status: response.status,
            success: false,
            attempts: attempt,
            message: `Receipt status "${receipt.status}" does not match "recorded"`,
          };
        }

        if (receipt.job_name !== jobName) {
          console.error(`[Scheduler] Receipt job_name "${receipt.job_name}" does not match requested "${jobName}"`);
          return {
            job_name: jobName,
            scheduled_for: scheduledForIso,
            status: response.status,
            success: false,
            attempts: attempt,
            message: `Receipt job_name "${receipt.job_name}" does not match requested "${jobName}"`,
          };
        }

        const returnedTime = new Date(String(receipt.scheduled_for)).getTime();
        const requestedTime = new Date(scheduledForIso).getTime();
        if (isNaN(returnedTime) || returnedTime !== requestedTime) {
          console.error(`[Scheduler] Receipt scheduled_for "${receipt.scheduled_for}" does not match requested "${scheduledForIso}"`);
          return {
            job_name: jobName,
            scheduled_for: scheduledForIso,
            status: response.status,
            success: false,
            attempts: attempt,
            message: `Receipt scheduled_for "${receipt.scheduled_for}" does not match requested "${scheduledForIso}"`,
          };
        }

        console.log(`[Scheduler] Tick verified successfully: job=${jobName} status=${response.status} duplicate=${Boolean(receipt.duplicate)}`);
        return {
          job_name: jobName,
          scheduled_for: scheduledForIso,
          status: response.status,
          success: true,
          attempts: attempt,
          duplicate: Boolean(receipt.duplicate),
          receipt_id: typeof receipt.receipt_id === 'string' ? receipt.receipt_id : undefined,
        };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err as Error;
      console.warn(`[Scheduler] Network/Timeout error on attempt ${attempt} for job ${jobName}:`, lastError.message);
    }

    // Wait before the single retry if transient error occurred
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    job_name: jobName,
    scheduled_for: scheduledForIso,
    status: lastStatus,
    success: false,
    attempts: attempt,
    message: lastError ? lastError.message : `Failed with status ${lastStatus}`,
  };
}

export default {
  async scheduled(
    event: { cron: string; scheduledTime: number },
    env: Env,
    _ctx?: unknown
  ): Promise<void> {
    const jobName = getJobNameForCron(event.cron);
    if (!jobName) {
      console.error(`[Scheduler] Unrecognized cron trigger expression: "${event.cron}"`);
      return;
    }

    const result = await dispatchTick(jobName, event.scheduledTime, env);
    if (!result.success) {
      console.error(`[Scheduler] Job ${jobName} failed after ${result.attempts} attempt(s): ${result.message}`);
    }
  },

  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Public /trigger is strictly removed (R1). Outbound dispatch is only triggered via scheduled cron events.
    if (url.pathname === '/') {
      return new Response(
        JSON.stringify({
          service: 'quickbite-scheduler-worker',
          status: 'healthy',
          registered_crons: Object.keys(CRON_JOB_MAP),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
