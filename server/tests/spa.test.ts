import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Production Frontend Serving & SPA Routing Guardrails (R7)', () => {
  const app = createApp();

  describe('Namespace Root & Descendant Isolation (R7)', () => {
    it('returns 404 JSON for bare /api root and NEVER serves HTML', async () => {
      const res = await request(app).get('/api');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.error).toBe('Endpoint not found');
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });

    it('returns 404 JSON for unknown /api subroutes and NEVER serves index.html', async () => {
      const res = await request(app).get('/api/unknown-endpoint');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.error).toBe('Endpoint not found');
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });

    it('returns 404 JSON for bare /internal root and NEVER serves HTML', async () => {
      const res = await request(app).get('/internal');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.error).toBe('Endpoint not found');
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });

    it('returns 404 JSON for unknown /internal routes and NEVER serves index.html', async () => {
      const res = await request(app).get('/internal/nonexistent-webhook');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.error).toBe('Endpoint not found');
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });

    it('rejects POST to unknown routes without serving HTML', async () => {
      const res = await request(app).post('/api/something').send({ foo: 'bar' });
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('<!DOCTYPE html>');
      expect(res.body.error).toBe('Endpoint not found');
    });
  });

  describe('Sanitized JSON Error Handling (R7)', () => {
    it('returns 400 JSON on malformed JSON payload without leaking HTML or stack trace', async () => {
      const res = await request(app)
        .post('/internal/tick')
        .set('Content-Type', 'application/json')
        .send('{ "job_name": "cutoff", invalid json');

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({ error: 'Malformed JSON payload' });
      expect(res.text).not.toContain('SyntaxError');
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });

    it('returns 413 JSON on oversized payload (> 256kb) without leaking HTML', async () => {
      // Create payload larger than 256kb
      const hugeString = 'x'.repeat(300 * 1024);
      const res = await request(app)
        .post('/internal/tick')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: hugeString }));

      expect(res.status).toBe(413);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({ error: 'Payload exceeds size limit' });
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });
  });

  describe('SPA Client Navigation Fallback', () => {
    it('serves HTML containing the visible DEMO MODE banner on root /', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('DEMO MODE');
      expect(res.text).toContain('QuickBite');
    });

    it('serves HTML for frontend navigation routes (e.g. /plans, /dashboard)', async () => {
      const res = await request(app).get('/plans');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('QuickBite');
    });
  });
});
