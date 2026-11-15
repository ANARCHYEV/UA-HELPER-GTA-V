#!/usr/bin/env node
/**
 * Switches the better-sqlite3 native binary between Node.js and Electron
 * ABIs. Needed only for development in this monorepo: the Electron app and
 * the Fastify server share one hoisted node_modules, but require different
 * ABI builds of the same native module.
 *
 *   node scripts/rebuild-native.mjs electron   -> before running the app / building
 *   node scripts/rebuild-native.mjs node       -> before running the server
 *
 * In production this is a non-issue: electron-builder rebuilds native deps
 * for Electron at packaging time, and the server installs its own deps on
 * the VPS.
 *
 * Windows note: npm "shim" scripts in node_modules/.bin are .cmd files that
 * cannot be spawned directly via execFileSync, so this script invokes the
 * JS entry (prebuild-install/bin.js) with the current Node executable.
 * That works identically on Windows, macOS and Linux.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const mode = process.argv[2];
if (mode !== 'electron' && mode !== 'node') {
  console.error('Usage: node scripts/rebuild-native.mjs <electron|node>');
  process.exit(1);
}

const root = process.cwd();
const requireFromRoot = createRequire(join(root, 'package.json'));

/** npm may hoist workspace dependencies or keep them under app/node_modules. */
function dependencyDir(name) {
  const candidates = [
    join(root, 'node_modules', name),
    join(root, 'app', 'node_modules', name)
  ];
  return candidates.find(existsSync) ?? candidates[0];
}

const sqliteDir = dependencyDir('better-sqlite3');
const bindingPath = join(sqliteDir, 'build', 'Release', 'better_sqlite3.node');

if (!existsSync(sqliteDir)) {
  console.error('better-sqlite3 not found - run "npm install" first.');
  process.exit(1);
}

/** Resolve the JS entry of prebuild-install (transitive dep of better-sqlite3). */
function prebuildInstallEntry() {
  try {
    return requireFromRoot.resolve('prebuild-install/bin.js');
  } catch {
    const fallback = join(root, 'node_modules', 'prebuild-install', 'bin.js');
    if (existsSync(fallback)) return fallback;
    return null;
  }
}

/** Locate npm-cli.js so we never rely on spawning "npm" shims directly. */
function npmCliPath() {
  if (process.env.npm_execpath && process.env.npm_execpath.endsWith('npm-cli.js')) {
    return process.env.npm_execpath;
  }
  const bundled = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(bundled)) return bundled;
  return null;
}

if (mode === 'node') {
  console.log('[rebuild-native] building better-sqlite3 for Node.js ABI...');
  const cli = npmCliPath();
  if (cli) {
    execFileSync(process.execPath, [cli, 'rebuild', 'better-sqlite3'], {
      cwd: root,
      stdio: 'inherit'
    });
  } else {
    // Last resort: let the OS shell resolve "npm" on PATH.
    execFileSync('npm', ['rebuild', 'better-sqlite3'], {
      cwd: root,
      stdio: 'inherit',
      shell: true
    });
  }
  console.log('[rebuild-native] done - the server (npm run server:dev) can run now.');
} else {
  const electronPkgPath = join(dependencyDir('electron'), 'package.json');
  if (!existsSync(electronPkgPath)) {
    console.error('electron not found - run "npm install" first.');
    process.exit(1);
  }
  const version = JSON.parse(readFileSync(electronPkgPath, 'utf-8')).version;

  const entry = prebuildInstallEntry();
  if (!entry) {
    console.error('prebuild-install not found - run "npm install" first.');
    process.exit(1);
  }

  console.log(`[rebuild-native] downloading better-sqlite3 prebuild for Electron ${version}...`);
  try {
    // prebuild-install must run with cwd = the better-sqlite3 package dir.
    execFileSync(
      process.execPath,
      [entry, '--runtime=electron', `--target=${version}`, '--force', '--verbose'],
      { cwd: sqliteDir, stdio: 'inherit' }
    );
  } catch {
    console.error(
      '[rebuild-native] prebuild download failed. Check your internet connection\n' +
        '[rebuild-native] (the archive is fetched from github.com) and try again.\n' +
        '[rebuild-native] Manual source build (needs Python 3 + MS Build Tools):\n' +
        '[rebuild-native]   cd node_modules\\better-sqlite3\n' +
        '[rebuild-native]   npx node-gyp rebuild --runtime=electron --target=' +
        version + ' --dist-url=https://electronjs.org/headers'
    );
    process.exit(1);
  }

  if (!existsSync(bindingPath)) {
    console.error('[rebuild-native] prebuild reported success, but the binary is missing.');
    process.exit(1);
  }
  console.log('[rebuild-native] done - the app (npm run dev) can run now.');
}
