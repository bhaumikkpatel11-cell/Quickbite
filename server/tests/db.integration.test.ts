import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import { config } from '../src/config.js';
import { createPoolConfig, getPool, closePool } from '../src/db/pool.js';

// F2 & M1B: Establish robust database isolation.
// Note: URL string inequality alone does not guarantee database isolation (differing query parameters,
// connection pooling endpoints, or aliases may target the same underlying database).
// We require an explicit TEST_DATABASE_URL, check host/database identity against application DATABASE_URL,
// and enforce uniquely named disposable schemas (CREATE SCHEMA test_qb_<uuid> ... DROP SCHEMA CASCADE)
// so all test data, migrations, and unique constraints run in full isolation without affecting production data.
const rawTestDbUrl = (config.testDatabaseUrl || process.env.TEST_DATABASE_URL)?.trim();
const rawAppDbUrl = (config.databaseUrl || process.env.DATABASE_URL)?.trim();

function checkDatabaseTargetsIdentical(testUrlStr?: string, appUrlStr?: string): boolean {
  if (!testUrlStr || !appUrlStr) return false;
  try {
    const testU = new URL(testUrlStr);
    const appU = new URL(appUrlStr);
    return testU.hostname === appU.hostname && testU.port === appU.port && testU.pathname === appU.pathname;
  } catch {
    return testUrlStr === appUrlStr;
  }
}

const isConfigured = Boolean(rawTestDbUrl);
const isSameDatabaseTarget = checkDatabaseTargetsIdentical(rawTestDbUrl, rawAppDbUrl);

describe('PostgreSQL Scheduler Runs Integration (Real DB)', () => {
  if (!isConfigured) {
    it.skip('BLOCKED: Real isolated PostgreSQL test database is not configured (TEST_DATABASE_URL is not set)', () => {
      // In accordance with M1A & instructor review directives (F2/R4):
      // "Keep the real suite BLOCKED if the isolated target is not configured.
      // Do not claim it has passed based on skip behavior. Do not substitute mocks."
    });
    return;
  }

  let adminPool: Pool;
  let testPool: Pool;
  const testSchema = `test_qb_${crypto.randomUUID().replace(/-/g, '_')}`;
  const TEST_SECRET = 'integration-tick-secret-test';
  const TEST_SCHEDULED_1 = '2026-11-15T23:00:00.000Z';
  const TEST_SCHEDULED_2 = '2026-11-15T23:10:00.000Z';

  beforeAll(async () => {
    // Task 2: Confirm branch distinction and connection mode
    if (isSameDatabaseTarget) {
      console.warn(
        `[Integration DB Warning] TEST_DATABASE_URL and DATABASE_URL point to the same host/database (${new URL(rawTestDbUrl!).hostname}). Disposable schema isolation (${testSchema}) will be enforced to protect data.`
      );
    } else {
      console.log(
        `[Integration DB] Distinct host endpoint detected: host=${new URL(rawTestDbUrl!).hostname}`
      );
    }

    // Connect to test database and create disposable isolated schema for this run
    adminPool = new Pool(createPoolConfig(rawTestDbUrl!));
    await adminPool.query(`CREATE SCHEMA "${testSchema}"`);

    // Scope connection string to the disposable schema via PostgreSQL search_path
    const scopedUrl = new URL(rawTestDbUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${testSchema}`);
    const scopedConnStr = scopedUrl.toString();

    // Close any prior singleton pool instance and configure app to use scoped test connection
    await closePool();
    config.tickSecret = TEST_SECRET;
    config.databaseUrl = scopedConnStr;

    testPool = new Pool(createPoolConfig(scopedConnStr));
    const appPool = getPool();

    // Task 3: Verify isolation before writing any migrations or data.
    // Both testPool and application pool MUST resolve current_schema() to testSchema.
    const { rows: testSchemaRows } = await testPool.query<{ cs: string }>('SELECT current_schema() as cs');
    const { rows: appSchemaRows } = await appPool.query<{ cs: string }>('SELECT current_schema() as cs');

    const testCs = testSchemaRows[0]?.cs;
    const appCs = appSchemaRows[0]?.cs;

    if (testCs !== testSchema || appCs !== testSchema) {
      throw new Error(
        `FATAL: Database isolation check failed! Expected current_schema to be "${testSchema}", but testPool got "${testCs}" and appPool got "${appCs}". Failing before writing to protect application schema.`
      );
    }

    // Run schema migrations inside the verified isolated test schema
    await runMigrations(testPool);
  }, 60000);

  afterAll(async () => {
    // Task 4: Cleanup removes only the test-owned schema and ensures both pools close reliably
    try {
      if (adminPool && testSchema) {
        await adminPool.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
        const { rows: postDropCheck } = await adminPool.query<{ count: string }>(
          'SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = $1',
          [testSchema]
        );
        if (parseInt(postDropCheck[0].count, 10) !== 0) {
          console.error('[Integration Cleanup Warning] Disposable schema still present after drop:', testSchema);
        } else {
          console.log(`[Integration DB] Successfully dropped disposable test schema "${testSchema}"`);
        }
      }
    } catch (cleanupErr) {
      console.error('[Integration Cleanup Error] Failed to drop disposable test schema:', cleanupErr);
    } finally {
      await Promise.allSettled([
        testPool ? testPool.end() : Promise.resolve(),
        adminPool ? adminPool.end() : Promise.resolve(),
        closePool(),
      ]);
    }
  }, 30000);

  it('guarantees logical idempotency: repeated ticks produce one row and return duplicate=true', async () => {
    const app = createApp();
    const payload = { job_name: 'cutoff', scheduled_for: TEST_SCHEDULED_1 };

    // Initial delivery
    const res1 = await request(app)
      .post('/internal/tick')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('recorded'); // Not 'completed'
    expect(res1.body.duplicate).toBe(false);

    // Retry / duplicate delivery
    const res2 = await request(app)
      .post('/internal/tick')
      .set('Authorization', `Bearer ${TEST_SECRET}`)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('recorded');
    expect(res2.body.duplicate).toBe(true);

    // Verify exactly one row in DB
    const countResult = await testPool.query(
      'SELECT COUNT(*) FROM scheduler_runs WHERE job_name = $1 AND scheduled_for = $2',
      [payload.job_name, payload.scheduled_for]
    );
    expect(parseInt(countResult.rows[0].count, 10)).toBe(1);
  }, 30000);

  it('handles concurrent tick delivery safely with unique constraint and transaction isolation', async () => {
    const app = createApp();
    const payload = { job_name: 'cutoff_retry', scheduled_for: TEST_SCHEDULED_2 };

    // Fire two identical tick requests simultaneously
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/internal/tick')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send(payload),
      request(app)
        .post('/internal/tick')
        .set('Authorization', `Bearer ${TEST_SECRET}`)
        .send(payload),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const duplicateFlags = [res1.body.duplicate, res2.body.duplicate].sort();
    expect(duplicateFlags).toEqual([false, true]);

    // Verify single receipt
    const countResult = await testPool.query(
      'SELECT COUNT(*), status FROM scheduler_runs WHERE job_name = $1 AND scheduled_for = $2 GROUP BY status',
      [payload.job_name, payload.scheduled_for]
    );
    expect(parseInt(countResult.rows[0].count, 10)).toBe(1);
    expect(countResult.rows[0].status).toBe('recorded');
  }, 30000);

  it('verifies that application tables outside the disposable test schema remain completely untouched (Task 4)', async () => {
    // Check whether public.scheduler_runs exists on this database target
    const { rows: tableCheck } = await adminPool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduler_runs') as exists"
    );

    if (tableCheck[0]?.exists) {
      // If public table exists, ensure our integration test keys were never written to it
      const { rows: publicRows } = await adminPool.query<{ count: string }>(
        "SELECT COUNT(*) FROM public.scheduler_runs WHERE scheduled_for IN ($1, $2)",
        [TEST_SCHEDULED_1, TEST_SCHEDULED_2]
      );
      expect(parseInt(publicRows[0].count, 10)).toBe(0);
    }
  }, 30000);

  it('confirms the test-owned disposable schema exists and is isolated during the test run (Task 4)', async () => {
    const { rows: schemaCheck } = await adminPool.query<{ count: string }>(
      'SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = $1',
      [testSchema]
    );
    expect(parseInt(schemaCheck[0].count, 10)).toBe(1);
  }, 30000);
});
