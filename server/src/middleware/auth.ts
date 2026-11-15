import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Safely compares two secret strings using crypto.timingSafeEqual.
 * Handles different lengths and empty strings without throwing.
 * Never logs or reveals secrets.
 */
export function safeCompareSecrets(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided, 'utf-8');
  const expectedBuffer = Buffer.from(expected, 'utf-8');

  // If buffer lengths differ, timingSafeEqual would throw.
  // We perform a dummy comparison against expectedBuffer to mitigate timing differences, then return false.
  if (providedBuffer.length !== expectedBuffer.length) {
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Middleware for authenticating POST /internal/tick.
 * Rejects requests if server secret is unconfigured or credentials do not match.
 */
export function authenticateTick(req: Request, res: Response, next: NextFunction): void {
  const serverSecret = config.tickSecret;
  if (!serverSecret || serverSecret.trim() === '') {
    // Fail safely when configuration is missing
    console.error('Tick authentication failed: TICK_SECRET is not configured on the server.');
    res.status(500).json({ error: 'Server authentication configuration is missing' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'Malformed Authorization header. Format: Bearer <token>' });
    return;
  }

  const token = parts[1];
  const isValid = safeCompareSecrets(token, serverSecret);

  if (!isValid) {
    res.status(401).json({ error: 'Invalid tick credentials' });
    return;
  }

  next();
}
