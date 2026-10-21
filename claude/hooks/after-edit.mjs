#!/usr/bin/env node
/**
 * PostToolUse (Edit|Write): format the edited file with the repo's own
 * formatter, then run only the tests related to it.
 *
 * - Formatter is chosen from the repo's config (Biome, Prettier, Ruff, Black);
 *   no config means no formatting. A configured but missing tool is reported,
 *   never silently skipped.
 * - Test failures are fed back to Claude as a blocking reason.
 * - Any internal failure is swallowed so edits are never broken by the hook.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';

const JS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const FORMAT_EXT = new Set([...JS_EXT, '.json', '.jsonc', '.css']);
const SKIP_DIRS = /(^|[\\/])(node_modules|\.git|dist|build|\.venv|__pycache__)([\\/]|$)/;
const TEST_TIMEOUT_MS = 120_000;

/** Walk up from `dir` to the first directory that looks like a project root. */
function findRoot(dir) {
  let current = resolve(dir);
  for (;;) {
    if (['package.json', 'pyproject.toml', '.git'].some((n) => existsSync(join(current, n)))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(dir);
    current = parent;
  }
}

/** Find `rel` under node_modules of `root` or any ancestor (monorepos hoist). */
function findNodeScript(root, rels) {
  let current = root;
  for (let i = 0; i < 6; i++) {
    for (const rel of rels) {
      const candidate = join(current, 'node_modules', rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** Run a command without a shell; returns status and combined output. */
function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: TEST_TIMEOUT_MS });
  return {
    status: result.error ? -1 : result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`,
  };
}

function tail(text, lines = 40) {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n');
}

function pythonFor(root) {
  const venv = [join(root, '.venv', 'Scripts', 'python.exe'), join(root, '.venv', 'bin', 'python')];
  return venv.find((p) => existsSync(p)) ?? 'python';
}

function toolFor(root, name) {
  const venv = [join(root, '.venv', 'Scripts', `${name}.exe`), join(root, '.venv', 'bin', name)];
  const local = venv.find((p) => existsSync(p));
  if (local) return local;
  return run(name, ['--version'], root).status === 0 ? name : null;
}

/** @returns {{ notes: string[] }} */
function formatFile(file, root, ext) {
  const notes = [];
  const pkg = readJson(join(root, 'package.json'));
  if (FORMAT_EXT.has(ext)) {
    const hasBiome = ['biome.json', 'biome.jsonc'].some((n) => existsSync(join(root, n)));
    const hasPrettier =
      pkg.prettier !== undefined ||
      readdirSync(root).some((n) => /^(\.prettierrc(\..+)?|prettier\.config\..+)$/.test(n));
    if (hasBiome) {
      const script = findNodeScript(root, ['@biomejs/biome/bin/biome']);
      if (script) run(process.execPath, [script, 'format', '--write', file], root);
      else notes.push('Biome is configured here but not installed; offer to install it in the next plan.');
    } else if (hasPrettier) {
      const script = findNodeScript(root, ['prettier/bin/prettier.cjs', 'prettier/bin-prettier.js']);
      if (script) run(process.execPath, [script, '--write', file], root);
      else notes.push('Prettier is configured here but not installed; offer to install it in the next plan.');
    }
  }
  if (ext === '.py') {
    const pyproject = readText(join(root, 'pyproject.toml'));
    const wantsRuff = ['ruff.toml', '.ruff.toml'].some((n) => existsSync(join(root, n))) || pyproject.includes('[tool.ruff');
    const wantsBlack = pyproject.includes('[tool.black');
    if (wantsRuff) {
      const ruff = toolFor(root, 'ruff');
      if (ruff) run(ruff, ['format', file], root);
      else notes.push('Ruff is configured here but not installed; offer to install it in the next plan.');
    } else if (wantsBlack) {
      const black = toolFor(root, 'black');
      if (black) run(black, [file], root);
      else notes.push('Black is configured here but not installed; offer to install it in the next plan.');
    }
  }
  return { notes };
}

/** Locate the pytest file matching a source file, if any. */
function findPythonTest(root, file) {
  const name = basename(file);
  if (/^test_.*\.py$|_test\.py$/.test(name)) return file;
  const stem = parse(name).name;
  const wanted = new Set([`test_${stem}.py`, `${stem}_test.py`]);
  const search = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !SKIP_DIRS.test(full)) {
        const found = search(full, depth + 1);
        if (found) return found;
      } else if (entry.isFile() && wanted.has(entry.name)) return full;
    }
    return null;
  };
  return ['tests', 'test'].map((d) => search(join(root, d), 0)).find(Boolean) ?? null;
}

/** @returns {{ notes: string[], failure: string | null }} */
function runRelatedTests(file, root, ext) {
  const notes = [];
  if (JS_EXT.has(ext)) {
    const pkg = readJson(join(root, 'package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    let invocation = null;
    if (deps.vitest) {
      const script = findNodeScript(root, ['vitest/vitest.mjs']);
      if (script) invocation = [script, 'related', '--run', '--passWithNoTests', file];
      else notes.push('Vitest is a dependency but not installed; offer to install dependencies in the next plan.');
    } else if (deps.jest) {
      const script = findNodeScript(root, ['jest/bin/jest.js']);
      if (script) invocation = [script, '--findRelatedTests', file, '--passWithNoTests'];
      else notes.push('Jest is a dependency but not installed; offer to install dependencies in the next plan.');
    }
    if (invocation) {
      const { status, output } = run(process.execPath, invocation, root);
      if (status !== 0) return { notes, failure: tail(output) };
    }
  } else if (ext === '.py') {
    const testFile = findPythonTest(root, file);
    if (testFile) {
      const { status, output } = run(pythonFor(root), ['-m', 'pytest', '-q', '-x', testFile], root);
      if (/No module named pytest/.test(output)) {
        notes.push('pytest is not installed in this environment; offer to install it in the next plan.');
      } else if (status !== 0) {
        return { notes, failure: tail(output) };
      }
    }
  }
  return { notes, failure: null };
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const raw = payload.tool_input?.file_path ?? payload.tool_response?.filePath;
  if (typeof raw !== 'string') return;
  const file = resolve(raw);
  if (!existsSync(file) || SKIP_DIRS.test(file)) return;

  const ext = extname(file).toLowerCase();
  const root = findRoot(dirname(file));
  const notes = [...formatFile(file, root, ext).notes];
  const tests = runRelatedTests(file, root, ext);
  notes.push(...tests.notes);

  if (tests.failure) {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          `Related tests failed after editing ${basename(file)}. Stop and fix the code before any further edits; ` +
          `if the failure looks unrelated, ask the user. Never edit a test just to make it pass.\n\n${tests.failure}`,
      }),
    );
  } else if (notes.length > 0) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n') },
      }),
    );
  }
}

try {
  main();
} catch {
  // Never break an edit because the hook failed.
}
