import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express, { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to compiled frontend assets
const webDistPath = path.resolve(__dirname, '../../../web/dist');
const indexHtmlPath = path.join(webDistPath, 'index.html');

/**
 * Checks whether a given request path belongs to the API, health check, or internal namespace.
 * R7: Strictly excludes both the bare namespace roots (/api, /internal, /livez, /readyz)
 * and their descendants.
 */
export function isApiOrHealthPath(pathname: string): boolean {
  return (
    pathname === '/livez' ||
    pathname.startsWith('/livez/') ||
    pathname === '/readyz' ||
    pathname.startsWith('/readyz/') ||
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/internal' ||
    pathname.startsWith('/internal/')
  );
}

/**
 * Configure Express to serve the production frontend build.
 *
 * CRITICAL GUARDRAIL:
 * SPA fallback must NOT turn unknown API routes, health checks, or internal webhooks
 * into HTML 200 responses. Requests under /api, /internal, /livez, /readyz must return
 * appropriate 404/error statuses instead of index.html.
 */
export function configureSpaServing(app: express.Express): void {
  // Serve static assets if web/dist exists
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath, { index: false }));
  }

  // SPA fallback handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Only handle GET and HEAD requests for SPA client navigation
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    const pathname = req.path;

    // R7: Never serve SPA HTML fallback for API, health, or webhook routes (roots and descendants)
    if (isApiOrHealthPath(pathname)) {
      res.status(404).json({ error: 'Endpoint not found' });
      return;
    }

    // Serve index.html for frontend navigation routes
    if (fs.existsSync(indexHtmlPath)) {
      res.sendFile(indexHtmlPath);
      return;
    }

    // Minimal fallback if frontend is not yet built
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>QuickBite — Demo Mode</title>
        </head>
        <body>
          <div id="root">
            <header style="background: #fff3cd; color: #856404; padding: 12px; font-weight: bold; border-bottom: 1px solid #ffeeba;">
              DEMO MODE — Solo M.Tech Project (Asia/Kolkata timezone). ₹0 free tier deployment. Mock payments only.
            </header>
            <main style="padding: 24px;">
              <h1>QuickBite Placeholder</h1>
              <p>Frontend production bundle pending build.</p>
            </main>
          </div>
        </body>
      </html>
    `);
  });
}
