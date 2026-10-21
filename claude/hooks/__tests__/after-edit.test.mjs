import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../after-edit.mjs', import.meta.url));

/** Create a throwaway repo with the given files (path -> content). */
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'after-edit-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** Run the hook for an edited file; returns parsed stdout or null when silent. */
function edit(root, rel) {
  const { stdout, status } = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(root, rel) } }),
    encoding: 'utf8',
  });
  assert.equal(status, 0, 'hook must always exit 0');
  return stdout ? JSON.parse(stdout) : null;
}

const cleanup = (root) => rmSync(root, { recursive: true, force: true });

test('is silent for a missing file, bad input, and unconfigured repos', () => {
  const root = makeRepo({ 'package.json': '{}', 'src/a.ts': 'export const a = 1;\n', 'tool.py': 'x = 1\n' });
  try {
    assert.equal(edit(root, 'src/missing.ts'), null);
    assert.equal(edit(root, 'src/a.ts'), null);
    assert.equal(edit(root, 'tool.py'), null);
    const { stdout, status } = spawnSync(process.execPath, [HOOK], { input: 'garbage', encoding: 'utf8' });
    assert.equal(status, 0);
    assert.equal(stdout, '');
  } finally {
    cleanup(root);
  }
});

test('reports a configured formatter that is not installed', () => {
  const root = makeRepo({ 'package.json': '{}', 'biome.json': '{}', 'src/a.ts': 'export const a = 1;\n' });
  try {
    const out = edit(root, 'src/a.ts');
    assert.match(out.hookSpecificOutput.additionalContext, /Biome.*not installed.*offer to install/);
  } finally {
    cleanup(root);
  }
});

test('runs the repo formatter when present (fake Prettier)', () => {
  const root = makeRepo({
    'package.json': '{}',
    '.prettierrc': '{}',
    'src/a.ts': 'export const a = 1;\n',
    'node_modules/prettier/bin/prettier.cjs':
      "const fs=require('fs');const f=process.argv[process.argv.length-1];fs.appendFileSync(f,'// formatted\\n');",
  });
  try {
    assert.equal(edit(root, 'src/a.ts'), null);
    assert.match(readFileSync(join(root, 'src/a.ts'), 'utf8'), /\/\/ formatted/);
  } finally {
    cleanup(root);
  }
});

test('blocks with the failure text when related tests fail (fake Vitest)', () => {
  const root = makeRepo({
    'package.json': JSON.stringify({ devDependencies: { vitest: '*' } }),
    'src/a.ts': 'export const a = 1;\n',
    'node_modules/vitest/vitest.mjs': "console.log('FAIL src/a.test.ts');process.exit(1);",
  });
  try {
    const out = edit(root, 'src/a.ts');
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /Stop and fix/);
    assert.match(out.reason, /Never edit a test just to make it pass/);
    assert.match(out.reason, /FAIL src\/a\.test\.ts/);
  } finally {
    cleanup(root);
  }
});

test('stays silent when related tests pass (fake Vitest)', () => {
  const root = makeRepo({
    'package.json': JSON.stringify({ devDependencies: { vitest: '*' } }),
    'src/a.ts': 'export const a = 1;\n',
    'node_modules/vitest/vitest.mjs': 'process.exit(0);',
  });
  try {
    assert.equal(edit(root, 'src/a.ts'), null);
  } finally {
    cleanup(root);
  }
});

test('reports a declared but uninstalled test runner', () => {
  const root = makeRepo({
    'package.json': JSON.stringify({ devDependencies: { jest: '*' } }),
    'src/a.ts': 'export const a = 1;\n',
  });
  try {
    const out = edit(root, 'src/a.ts');
    assert.match(out.hookSpecificOutput.additionalContext, /Jest.*not installed/);
  } finally {
    cleanup(root);
  }
});

test('ignores files in node_modules', () => {
  const root = makeRepo({ 'package.json': '{}', 'biome.json': '{}', 'node_modules/x/a.ts': 'export {};\n' });
  try {
    assert.equal(edit(root, 'node_modules/x/a.ts'), null);
  } finally {
    cleanup(root);
  }
});
