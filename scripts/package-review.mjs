import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rawMilestone = process.argv[2] || 'M1A';
const isM1BDatabase = rawMilestone === 'M1B_Database' || rawMilestone === 'M1B';
const milestone = isM1BDatabase ? 'M1B' : rawMilestone;
const versionTag = process.argv[3] ? `_${process.argv[3]}` : '';
console.log(`[Review Packaging] Packaging milestone: ${rawMilestone}${versionTag ? ` (version tag: ${process.argv[3]})` : ''}`);

// 1. Validate required reports
const reviewDir = path.join(rootDir, 'docs', 'reviews', milestone);
const requiredReports = ['REPORT.md', 'VERIFICATION.md', 'NEXT_STEPS.md'];

for (const report of requiredReports) {
  const reportPath = path.join(reviewDir, report);
  if (!fs.existsSync(reportPath)) {
    console.error(`[Error] Missing required report: ${reportPath}`);
    process.exit(1);
  }
}

// 2. Query git state safely
let gitBranch = 'master';
let gitCommit = 'no commits yet';
let uncommittedStatus = 'uncommitted changes present';

try {
  gitBranch = execSync('git branch --show-current', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim() || 'master';
} catch {
  // Ignore
}

try {
  gitCommit = execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
} catch {
  gitCommit = 'no commits yet';
}

try {
  const porcelain = execSync('git status --porcelain', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  uncommittedStatus = porcelain ? 'Working tree contains uncommitted/untracked files' : 'Clean working tree';
} catch {
  // Ignore
}

// 3. Define explicit inclusion list
const explicitFiles = [
  'AGENTS.md',
  'GEMINI.md',
  '.gitignore',
  '.env.example',
  'package.json',
  'package-lock.json',
  'skills-lock.json',
  'scripts/package-review.mjs',
  'docs/PROJECT.md',
  'docs/BUSINESS_RULES.md',
  'docs/ARCHITECTURE.md',
  'docs/BACKLOG.md',
  'docs/HANDOFF.md',
  'docs/REVIEW_PROCESS.md',
  'docs/evidence/M1B_DATABASE.md',
  'docs/reviews/M1A/REPORT.md',
  'docs/reviews/M1A/VERIFICATION.md',
  'docs/reviews/M1A/NEXT_STEPS.md',
  'docs/reviews/M1A/FILE_MANIFEST.md',
  'docs/reviews/M1A/INSTRUCTOR_REVIEW.md',
  'docs/reviews/M1A/INSTRUCTOR_REVIEW_V2.md',
  'docs/reviews/M1A/REPAIR_PROGRESS.md',
  `docs/reviews/${milestone}/REPORT.md`,
  `docs/reviews/${milestone}/VERIFICATION.md`,
  `docs/reviews/${milestone}/NEXT_STEPS.md`,
  `docs/reviews/${milestone}/FILE_MANIFEST.md`,
];

const includedDirectories = [
  'server/src',
  'server/migrations',
  'server/tests',
  'web/src',
  'worker/src',
  'worker/tests',
  '.agents/skills',
  'docs/evidence',
];

const singleConfigCandidateFiles = [
  'server/package.json',
  'server/tsconfig.json',
  'web/package.json',
  'web/tsconfig.json',
  'web/tsconfig.node.json',
  'web/vite.config.ts',
  'web/index.html',
  'worker/package.json',
  'worker/tsconfig.json',
  'worker/wrangler.jsonc',
];

// Helper to recursively collect files
function collectFiles(dir) {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) return [];
  const results = [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      results.push(...collectFiles(rel));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

const allCandidateFiles = new Set([
  ...explicitFiles,
  ...singleConfigCandidateFiles,
]);

for (const dir of includedDirectories) {
  const files = collectFiles(dir);
  for (const f of files) {
    allCandidateFiles.add(f);
  }
}

// 4. Strict Exclusion & Secret Inspection
const bannedPatterns = [
  /(^|\/)\.env($|\..*)/, // matches .env, .env.local, etc. EXCEPT .env.example checked below
  /node_modules/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)build(\/|$)/,
  /(^|\/)coverage(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)review-packages(\/|$)/,
  /\.zip$/,
  /\.log$/,
  /\.system_generated/,
];

/**
 * Line-by-line secret scanner (R8).
 * Checks both postgres:// and postgresql:// connection strings.
 * Evaluates credentials line-by-line rather than exempting entire files.
 */
function inspectFileForSecrets(relPath, textContent) {
  // Exempt the scanner script itself
  if (relPath === 'scripts/package-review.mjs') {
    return;
  }

  const lines = textContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for private keys
    if (
      line.includes('BEGIN PRIVATE KEY') ||
      line.includes('BEGIN RSA PRIVATE KEY') ||
      line.includes('BEGIN OPENSSH PRIVATE KEY') ||
      line.includes('BEGIN EC PRIVATE KEY')
    ) {
      throw new Error(`Private key detected in ${relPath}:${lineNum}`);
    }

    // Check connection strings (postgres:// and postgresql://)
    const connMatch = line.match(/(postgres|postgresql):\/\/([^@\s]+)@([^\s/]+)/i);
    if (connMatch) {
      const userInfo = connMatch[2]; // username:password
      const host = connMatch[3];

      // Whitelist acceptable local test fixtures / documented placeholders on that specific line
      const isSafePlaceholder =
        userInfo.includes('placeholder_password') ||
        userInfo === 'username:password' ||
        (userInfo === 'mock:mock' && host.includes('localhost')) ||
        (userInfo === 'user:pass' && (host.includes('localhost') || host.includes('ep-cool-sample'))) ||
        (userInfo === 'postgres:postgres' && host.includes('localhost')) ||
        (userInfo === 'secret_user:super_secret_password' && host.includes('db.example.com'));

      if (!isSafePlaceholder) {
        throw new Error(`Potential active database credential in ${relPath}:${lineNum}`);
      }
    }

    // Check for common API token formats
    if (/ghp_[A-Za-z0-9]{36}/.test(line) || /xox[baprs]-[A-Za-z0-9-]{20,}/.test(line)) {
      throw new Error(`Suspicious API token detected in ${relPath}:${lineNum}`);
    }
  }
}

const finalIncludedFiles = [];
const manifestEntries = [];

for (const relPath of Array.from(allCandidateFiles).sort()) {
  const fullPath = path.join(rootDir, relPath);

  // Skip manifest file during initial collection (it will be created in step 5)
  if (relPath.endsWith('FILE_MANIFEST.md')) {
    finalIncludedFiles.push(relPath);
    continue;
  }

  if (!fs.existsSync(fullPath)) {
    continue;
  }

  // Check banned patterns
  if (relPath !== '.env.example' && bannedPatterns.some((pattern) => pattern.test(relPath))) {
    console.warn(`[Exclusion] Excluding banned file path: ${relPath}`);
    continue;
  }

  const content = fs.readFileSync(fullPath);

  try {
    inspectFileForSecrets(relPath, content.toString('utf-8'));
  } catch (err) {
    console.error(`[Security Alert] ${err.message}! Halting packaging.`);
    process.exit(1);
  }

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const size = fs.statSync(fullPath).size;

  finalIncludedFiles.push(relPath);
  manifestEntries.push({ path: relPath, size, hash });
}

console.log('[Security Scanner] Line-by-line secret inspection passed.');
console.log('  Notice: Automated pattern scanning reduces leakage risk but does not guarantee complete detection; manual inspection of staged archives remains mandatory.');

// 5. Generate docs/reviews/<milestone>/FILE_MANIFEST.md
// R8: Omit manifest self-hash to maintain cryptographic accuracy of the manifest file itself.
const manifestContent = `# QuickBite Milestone ${milestone} File Manifest

## Repository State
- **Branch**: \`${gitBranch}\`
- **HEAD Commit**: \`${gitCommit}\`
- **Working Tree State**: ${uncommittedStatus}
- **Reviewed Snapshot**: Local working tree snapshot for milestone ${milestone}

---

## Excluded Categories
The following categories are strictly excluded from this review package:
- Git internal version control directory (\`.git/\`)
- Real credentials and environment files (\`.env\`, \`.env.*\`, excluding \`.env.example\`)
- API tokens, passwords, database credentials, and private keys
- Dependency folders (\`node_modules/\`, \`.pnpm-store/\`)
- Build and compilation output (\`dist/\`, \`build/\`, \`out/\`)
- Test coverage artifacts (\`coverage/\`, \`playwright-report/\`)
- Review package archives and previous ZIP files (\`review-packages/\`, \`*.zip\`)
- Tool logs and agent runtime scratch (\`*.log\`, \`.system_generated/\`, \`tmp/\`)

---

## Security Scanner Notice (R8)
Every included file has been inspected line-by-line for private keys, sensitive database connection strings, and credential tokens. Note: Automated regex scanning reduces risk but cannot guarantee detection of all credential patterns; manual review of staged files remains mandatory.

---

## Included Source and Configuration Files (${manifestEntries.length} files indexed)

*Note: This manifest lists all ${manifestEntries.length} packaged source, test, config, and report files. In accordance with R8, the manifest itself is omitted from self-indexing to maintain cryptographic integrity.*

| File Path | Size (Bytes) | SHA-256 Checksum |
| :--- | :---: | :--- |
${manifestEntries.map((e) => `| \`${e.path}\` | ${e.size} | \`${e.hash}\` |`).join('\n')}
`;

const manifestPath = path.join(reviewDir, 'FILE_MANIFEST.md');
fs.writeFileSync(manifestPath, manifestContent, 'utf-8');
console.log(`[Manifest] Generated: ${manifestPath}`);

// 6. Stage file mapping for archive creation
const stagingList = finalIncludedFiles.map((rel) => ({
  src: path.join(rootDir, rel),
  entry: rel.replace(/\\/g, '/'),
}));

const stagingJsonPath = path.join(rootDir, 'temp_staging_files.json');
fs.writeFileSync(stagingJsonPath, JSON.stringify(stagingList, null, 2), 'utf-8');

// 7. Create ZIP archive with portable forward slashes (R8)
const outDir = path.join(rootDir, 'review-packages');
fs.mkdirSync(outDir, { recursive: true });
const zipName = rawMilestone === 'M1B_Database'
  ? 'QuickBite_M1B_Database_Review.zip'
  : `QuickBite_${milestone}_Review${versionTag}.zip`;
const zipPath = path.join(outDir, zipName);

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log(`[Archive] Creating ZIP archive at: ${zipPath}`);

const packScriptPath = path.join(rootDir, 'temp_pack.ps1');
const packScriptContent = `
param([string]$targetZip, [string]$manifestJson)
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($targetZip, [System.IO.Compression.ZipArchiveMode]::Create)
$items = Get-Content -Raw -Path $manifestJson | ConvertFrom-Json
foreach ($item in $items) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.src, $item.entry) | Out-Null
}
$zip.Dispose()
`;
fs.writeFileSync(packScriptPath, packScriptContent, 'utf-8');

try {
  const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${packScriptPath}" -targetZip "${zipPath}" -manifestJson "${stagingJsonPath}"`;
  execSync(psCommand, { stdio: 'inherit' });
} catch (err) {
  console.error('[Error] Failed to create ZIP archive:', err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(stagingJsonPath)) fs.unlinkSync(stagingJsonPath);
  if (fs.existsSync(packScriptPath)) fs.unlinkSync(packScriptPath);
}

// 8. Verify packaged file hashes after archive creation (R8)
console.log('[Verification] Verifying packaged file hashes inside created archive...');
const verifyScriptPath = path.join(rootDir, 'temp_verify.ps1');
const verifyScriptContent = `
param([string]$targetZip)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($targetZip)
$sha = [System.Security.Cryptography.SHA256]::Create()
foreach ($entry in $zip.Entries) {
    $stream = $entry.Open()
    $hashBytes = $sha.ComputeHash($stream)
    $stream.Close()
    $hashStr = [BitConverter]::ToString($hashBytes).Replace('-', '').ToLower()
    Write-Output "$($entry.FullName):$hashStr"
}
$zip.Dispose()
`;
fs.writeFileSync(verifyScriptPath, verifyScriptContent, 'utf-8');

try {
  const psVerify = `powershell -NoProfile -ExecutionPolicy Bypass -File "${verifyScriptPath}" -targetZip "${zipPath}"`;
  const verifyOutput = execSync(psVerify).toString('utf-8');
  const archivedMap = new Map();
  for (const line of verifyOutput.trim().split(/\r?\n/)) {
    if (!line.includes(':')) continue;
    const [entryName, hash] = line.split(':');
    archivedMap.set(entryName.trim().replace(/\\/g, '/'), hash.trim());
  }

  for (const entry of manifestEntries) {
    const archivedHash = archivedMap.get(entry.path);
    if (!archivedHash) {
      console.error(`[Verification Error] Missing entry in archive: ${entry.path}`);
      process.exit(1);
    }
    if (archivedHash !== entry.hash) {
      console.error(`[Verification Error] Hash mismatch for ${entry.path}: expected ${entry.hash}, found ${archivedHash}`);
      process.exit(1);
    }
  }
  console.log(`[Verification] Successfully verified all ${manifestEntries.length} indexed files in archive!`);
} catch (err) {
  console.error('[Verification Warning] Archive internal check failed:', err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(verifyScriptPath)) fs.unlinkSync(verifyScriptPath);
}

// 9. Generate archive checksum
const archiveBuffer = fs.readFileSync(zipPath);
const archiveSha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
const checksumPath = `${zipPath}.sha256`;
fs.writeFileSync(checksumPath, `${archiveSha256}  ${zipName}\n`, 'utf-8');
console.log(`[Checksum] Generated archive SHA-256: ${archiveSha256}`);

// 10. Output results
const zipStat = fs.statSync(zipPath);
const zipSizeKb = (zipStat.size / 1024).toFixed(2);
console.log(`[Success] Review package created successfully!`);
console.log(`  Path: ${zipPath}`);
console.log(`  SHA-256: ${archiveSha256}`);
console.log(`  Size: ${zipStat.size} bytes (${zipSizeKb} KB)`);
console.log(`  Included Files: ${finalIncludedFiles.length}`);
