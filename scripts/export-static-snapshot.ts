import fs from 'fs';
import path from 'path';
import { runLiveSync } from '../server/dataSync.ts';

async function main() {
  const snapshot = await runLiveSync(true);
  const outDir = path.resolve(process.cwd(), 'public', 'data');
  const outFile = path.join(outDir, 'live-snapshot.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(
    `Static GitHub Pages snapshot written to ${outFile} (${snapshot.vacancies.length} vacancies)`
  );
}

main().catch((err) => {
  console.error('Failed to build static snapshot:', err);
  process.exit(1);
});
