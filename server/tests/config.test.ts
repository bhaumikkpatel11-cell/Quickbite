import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadEnv, config, findRepoRoot } from '../src/config.js';

describe('Root .env Loading & Discovery (F1/R2)', () => {
  const originalEnv = { ...process.env };
  let fixtureRootDir: string;
  let fixtureEnvPath: string;

  beforeAll(() => {
    // Create an isolated temporary directory fixture in OS temp
    // NEVER touch or write to the actual repository-root .env during tests (F1)
    fixtureRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-fixture-workspace-'));
    fixtureEnvPath = path.join(fixtureRootDir, '.env');

    // Create fake package.json with workspaces to simulate repository root
    fs.writeFileSync(
      path.join(fixtureRootDir, 'package.json'),
      JSON.stringify({ name: 'mock-quickbite-repo', workspaces: ['server', 'web', 'worker'] }),
      'utf-8'
    );

    // Create fake subdirectories simulating source and compiled locations
    fs.mkdirSync(path.join(fixtureRootDir, 'server', 'src'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRootDir, 'server', 'dist'), { recursive: true });
  });

  afterAll(() => {
    // Safely remove only test-owned temporary fixture directory
    if (fixtureRootDir && fs.existsSync(fixtureRootDir)) {
      fs.rmSync(fixtureRootDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean environment variables for test isolation
    delete process.env.PORT;
    delete process.env.TICK_SECRET;
    delete process.env.SENTINEL_FIXTURE_VAR;
  });

  afterEach(() => {
    // Restore original process.env
    process.env = { ...originalEnv };
    if (fs.existsSync(fixtureEnvPath)) {
      fs.unlinkSync(fixtureEnvPath);
    }
  });

  it('correctly discovers repository root from both source-like and compiled-like subdirectories', () => {
    const srcDir = path.join(fixtureRootDir, 'server', 'src');
    const distDir = path.join(fixtureRootDir, 'server', 'dist');

    expect(findRepoRoot(srcDir)).toBe(fixtureRootDir);
    expect(findRepoRoot(distDir)).toBe(fixtureRootDir);
  });

  it('loads environment variables from the isolated fixture .env without touching host files', () => {
    const sentinelContent = 'SENTINEL_FIXTURE_VAR=survived_safely_123\nPORT=4567\n';
    fs.writeFileSync(fixtureEnvPath, sentinelContent, 'utf-8');

    // Disable local fallback to avoid reading any ambient .env
    loadEnv(fixtureEnvPath, { loadLocalFallback: false });

    expect(process.env.SENTINEL_FIXTURE_VAR).toBe('survived_safely_123');
    expect(config.port).toBe(4567);
  });

  it('preserves externally supplied environment variable precedence over fixture .env file', () => {
    // Externally set PORT before loading .env
    process.env.PORT = '8888';

    const sentinelContent = 'PORT=4567\n';
    fs.writeFileSync(fixtureEnvPath, sentinelContent, 'utf-8');

    loadEnv(fixtureEnvPath, { loadLocalFallback: false });

    // External env var MUST win
    expect(process.env.PORT).toBe('8888');
    expect(config.port).toBe(8888);
  });
});
