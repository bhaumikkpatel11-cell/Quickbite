import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Traverses up from startDir until the repository root (containing workspace package.json) is found.
 * Works consistently across tsx source execution and compiled dist/ execution.
 */
export function findRepoRoot(startDir: string = __dirname): string {
  let current = startDir;
  while (current && current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return current;
        }
      } catch {
        // Continue searching
      }
    }
    current = path.dirname(current);
  }
  // Fallback: 2 levels up from server/src or server/dist
  return path.resolve(startDir, '../..');
}

export const repoRoot = findRepoRoot();
export const rootEnvPath = path.join(repoRoot, '.env');

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string | undefined;
  testDatabaseUrl: string | undefined;
  tickSecret: string | undefined;
  dbConnectTimeoutMs: number;
  dbQueryTimeoutMs: number;
  dbIdleTimeoutMs: number;
  dbMaxConnections: number;
  readyzCacheTtlMs: number;
}

let _port = parseInt(process.env.PORT || '3000', 10);
let _nodeEnv = process.env.NODE_ENV || 'development';
let _databaseUrl = process.env.DATABASE_URL;
let _testDatabaseUrl = process.env.TEST_DATABASE_URL;
let _tickSecret = process.env.TICK_SECRET;

export function syncConfigWithEnv(): void {
  _port = parseInt(process.env.PORT || '3000', 10);
  _nodeEnv = process.env.NODE_ENV || 'development';
  _databaseUrl = process.env.DATABASE_URL;
  _testDatabaseUrl = process.env.TEST_DATABASE_URL;
  _tickSecret = process.env.TICK_SECRET;
}

/**
 * Loads repository-root .env (and optional local .env fallback).
 * By default, dotenv does not overwrite existing process.env variables,
 * strictly preserving externally supplied environment-variable precedence.
 *
 * @param targetPath Path to root .env file.
 * @param options.loadLocalFallback When true (default in app runtime), also loads process.cwd()/.env if distinct.
 *                                  Set to false in tests to prevent touching or reading the host workspace .env.
 */
export function loadEnv(
  targetPath: string = rootEnvPath,
  options: { loadLocalFallback?: boolean } = { loadLocalFallback: true }
): void {
  if (fs.existsSync(targetPath)) {
    dotenv.config({ path: targetPath });
  }
  if (options.loadLocalFallback) {
    const localEnv = path.resolve(process.cwd(), '.env');
    if (localEnv !== targetPath && fs.existsSync(localEnv)) {
      dotenv.config({ path: localEnv });
    }
  }
  syncConfigWithEnv();
}

// Perform initial environment loading
loadEnv();

export const config: AppConfig = {
  get port(): number {
    return _port;
  },
  set port(v: number) {
    _port = v;
  },
  get nodeEnv(): string {
    return _nodeEnv;
  },
  set nodeEnv(v: string) {
    _nodeEnv = v;
  },
  get databaseUrl(): string | undefined {
    return _databaseUrl;
  },
  set databaseUrl(v: string | undefined) {
    _databaseUrl = v;
  },
  get testDatabaseUrl(): string | undefined {
    return _testDatabaseUrl;
  },
  set testDatabaseUrl(v: string | undefined) {
    _testDatabaseUrl = v;
  },
  get tickSecret(): string | undefined {
    return _tickSecret;
  },
  set tickSecret(v: string | undefined) {
    _tickSecret = v;
  },
  dbConnectTimeoutMs: 15000, // 15s to tolerate Neon serverless compute cold start
  dbQueryTimeoutMs: 10000,
  dbIdleTimeoutMs: 10000, // 10s idle release for Neon scale-to-zero
  dbMaxConnections: 5,     // modest pool size for free tier
  readyzCacheTtlMs: 30000, // 30s cache TTL to avoid keeping DB awake
};
