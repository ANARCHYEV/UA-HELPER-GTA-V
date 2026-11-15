/** Generates latest.yml for electron-updater (generic provider). Usage: npm run gen:latest-yml */
import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../src/config';
import { getDb, run, rows } from '../src/db/db';

getDb();

const version = process.argv[2];
const filePath = process.argv[3];
if (!version || !filePath || !existsSync(filePath)) {
  console.error('usage: tsx scripts/gen-latest-yml.ts <version> <path-to-nsis-exe>');
  process.exit(1);
}

const fileName = filePath.split(/[\\/]/).pop() as string;
const size = statSync(filePath).size;
const sha512 = createHash('sha512').update(readFileSync(filePath)).digest('base64');

// publish url = public downloads base + file name
const url = `${config.downloadsPublicUrl.replace(/\/$/, '')}/${fileName}`;

const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  'path: ' + fileName,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  'githubArtifactName: null'
].join('\n');

const outPath = join(process.cwd(), 'downloads');
import { mkdirSync } from 'fs';
mkdirSync(outPath, { recursive: true });
writeFileSync(join(outPath, 'latest.yml'), yml);
console.log('latest.yml written to', join(outPath, 'latest.yml'));
console.log('copy both files to the nginx downloads dir:', config.downloadsPublicUrl);

// record the release in the DB for /v1/app/version
const existing = rows('SELECT version FROM app_releases WHERE version = ?', version);
if (existing.length === 0) {
  run(
    'INSERT INTO app_releases (version, channel, url, sha512, notes, mandatory, published_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    version,
    'stable',
    url,
    sha512,
    null,
    Date.now()
  );
  console.log('release recorded in app_releases');
}
