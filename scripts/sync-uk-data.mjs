/**
 * Standalone daily sync entrypoint for GitHub Actions -> GitHub Pages (£0/mo).
 * Delegates to server/dataSync.ts via tsx so static GitHub Pages builds receive
 * the exact normalized SyncedMarketSnapshot schema at public/data/live-snapshot.json.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const tsxBin = path.resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
);
const targetScript = path.resolve(process.cwd(), 'scripts', 'export-static-snapshot.ts');

execFileSync(tsxBin, [targetScript], { stdio: 'inherit' });
