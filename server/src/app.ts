import express, { Request, Response, NextFunction } from 'express';
import { healthRouter } from './routes/health.js';
import { tickRouter } from './routes/tick.js';
import { configureSpaServing } from './middleware/spa.js';

export function createApp(): express.Express {
  const app = express();

  // Parse JSON payloads with bounded size (256kb)
  app.use(express.json({ limit: '256kb' }));

  // Security headers
  app.disable('x-powered-by');

  // Health and scheduler routes
  app.use(healthRouter);
  app.use(tickRouter);

  // Serve production SPA and handle client navigation fallback
  configureSpaServing(app);

  // Catch-all for any unmatched routes (e.g. POST /unknown or unmatched methods)
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Centralized sanitized JSON error handler (R7)
  // Handles malformed JSON, oversized payloads, and unexpected errors without leaking HTML or stack traces
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (typeof err === 'object' && err !== null) {
      const errorObj = err as { status?: number; type?: string; message?: string; body?: unknown };

      // Malformed JSON parsing error from body-parser
      if (err instanceof SyntaxError && errorObj.status === 400 && 'body' in errorObj) {
        res.status(400).json({ error: 'Malformed JSON payload' });
        return;
      }

      // Payload exceeds size limit (entity.too.large)
      if (errorObj.type === 'entity.too.large' || errorObj.status === 413) {
        res.status(413).json({ error: 'Payload exceeds size limit' });
        return;
      }

      // Explicit 4xx client errors
      if (typeof errorObj.status === 'number' && errorObj.status >= 400 && errorObj.status < 500) {
        res.status(errorObj.status).json({ error: errorObj.message || 'Client error' });
        return;
      }
    }

    // Unexpected internal server errors: log error message sanitized of credentials, return 500 JSON
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Unhandled internal server error:', errorMessage);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
