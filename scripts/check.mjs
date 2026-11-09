import { readdirSync } from 'node:fs';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

// Keep Swift/AppKit and helper-dependent tests out of the portable check.
const nativeTests = new Set([
  'build-safety.test.mjs',
  'cursor-geometry.test.mjs',
  'cursor-rendering.test.mjs',
  'cursor-style.test.mjs',
  'native-fixture-record.test.mjs',
  'native-focus-policy.test.mjs',
  'native-policy.test.mjs',
  'native-unicode-packets.test.mjs',
]);
const includeNative = process.argv.includes('--native');
const directory = new URL('../tests/', import.meta.url);
const files = readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs') && (includeNative || !nativeTests.has(name)))
  .map(name => fileURLToPath(new URL(name, directory)));

run({ files, concurrency: true })
  .on('test:fail', () => { process.exitCode = 1; })
  .on('test:pass', ({ name, skip }) => {
    if (skip) {
      console.error(`Required test was skipped: ${name}`);
      process.exitCode = 1;
    }
  })
  .compose(spec)
  .pipe(process.stdout);
