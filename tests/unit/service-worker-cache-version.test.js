import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';

// Regression guard for exactly the bug that just shipped: styles.css was changed
// (to make the offline-mode toggle visibly highlight when on) without bumping
// service-worker.js's CACHE_NAME - so the service worker kept serving the old,
// pre-fix shell to anyone who'd already loaded the app, and the fix silently never
// reached them. skipWaiting()/clients.claim() only take effect once the browser
// treats the worker as "changed" at all, which it never does unless CACHE_NAME (or
// some other byte in the file) actually changes.
//
// This test hashes the real contents of every file service-worker.js's SHELL_FILES
// lists, and checks that hash against a fixture recorded for the *current*
// CACHE_NAME. If someone edits a shell file and forgets to bump CACHE_NAME, the
// hash for that cache name no longer matches and this fails loudly - the fix is to
// bump CACHE_NAME and record the new hash below (see "How to update" at the bottom).

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '../..');

// Recorded hash per CACHE_NAME, kept in sync by hand alongside service-worker.js.
const KNOWN_SHELL_HASHES = {
  'workout-tracker-shell-v5': '84b5f00f5504e38e8adc99348991e04a1e424d2894dd486838eb85f0418d4b4f'
};

function readShellFilesFromServiceWorker() {
  const swSource = readFileSync(resolve(repoRoot, 'service-worker.js'), 'utf8');

  const cacheNameMatch = swSource.match(/const CACHE_NAME = '([^']+)'/);
  if (!cacheNameMatch) throw new Error('Could not find CACHE_NAME in service-worker.js');
  const cacheName = cacheNameMatch[1];

  const shellFilesMatch = swSource.match(/const SHELL_FILES = \[([\s\S]*?)\];/);
  if (!shellFilesMatch) throw new Error('Could not find SHELL_FILES in service-worker.js');
  const paths = [...shellFilesMatch[1].matchAll(/'([^']+)'/g)]
    .map(m => m[1])
    .map(p => (p === '/' ? '/index.html' : p)) // '/' and '/index.html' are the same file
    .filter((p, i, arr) => arr.indexOf(p) === i); // de-dupe

  return { cacheName, paths };
}

function hashShellFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths.slice().sort()) { // sorted so file order in the array doesn't matter
    hash.update(readFileSync(resolve(repoRoot, path.replace(/^\//, ''))));
  }
  return hash.digest('hex');
}

describe('Service worker cache versioning', () => {
  it('should have a CACHE_NAME whose recorded hash matches the real shell files\' current contents', () => {
    const { cacheName, paths } = readShellFilesFromServiceWorker();
    const actualHash = hashShellFiles(paths);
    const knownHash = KNOWN_SHELL_HASHES[cacheName];

    if (!knownHash) {
      throw new Error(
        `No recorded hash for CACHE_NAME "${cacheName}" in this test's KNOWN_SHELL_HASHES. ` +
        `Add one: computed hash is ${actualHash}`
      );
    }

    expect(actualHash).toBe(knownHash);
    // If this fails: a shell file (index.html/app.js/styles.css/cache-manager.js/
    // auth-manager.js/manifest.json/icons) changed since CACHE_NAME was last bumped.
    // Fix: bump CACHE_NAME in service-worker.js to a new value, then add that new
    // value's real hash (printed by a failing run of this test, or by re-running it
    // after the bump and reading the "No recorded hash" error's computed value) to
    // KNOWN_SHELL_HASHES above.
  });
});
