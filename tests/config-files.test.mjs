import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const GIT_BASH = join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
const BASH = existsSync(GIT_BASH) ? GIT_BASH : 'bash';
const hasTool = (cmd, args) => spawnSync(cmd, args, { shell: true }).status === 0;

test('JSON config files are valid', () => {
  for (const rel of ['vscode/settings.json', 'templates/repo/biome.json', 'docker/daemon.json']) {
    assert.doesNotThrow(() => JSON.parse(read(rel)), rel);
  }
});

test('VS Code settings carry no machine-specific paths or telemetry opt-ins', () => {
  const text = read('vscode/settings.json');
  assert.doesNotMatch(text, /java\.jdt\.ls\.java\.home/);
  assert.doesNotMatch(text, /telemetry/i);
  assert.doesNotMatch(text, /C:\\\\Users/);
});

test('extension lists are well formed and do not overlap', () => {
  const parse = (rel) => read(rel).split(/\r?\n/).filter(Boolean);
  const core = parse('vscode/extensions.txt');
  const optional = parse('vscode/extensions-optional.txt');
  for (const id of [...core, ...optional]) assert.match(id, /^[a-z0-9-]+\.[a-z0-9-]+$/i, id);
  assert.equal(new Set(core).size, core.length);
  assert.deepEqual(core.filter((id) => optional.includes(id)), []);
  assert.ok(core.includes('biomejs.biome'));
});

/** Parse the `---` frontmatter block into a key/value map. */
function frontmatter(rel) {
  const match = read(rel).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, `${rel} needs frontmatter`);
  return Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]),
  );
}

test('slash commands and agents have valid frontmatter', () => {
  for (const rel of ['claude/commands/plan-first.md', 'claude/commands/commit-review.md']) {
    assert.ok(frontmatter(rel).description, rel);
  }
  const reviewer = frontmatter('claude/agents/security-reviewer.md');
  const writer = frontmatter('claude/agents/test-writer.md');
  assert.equal(reviewer.name, 'security-reviewer');
  assert.equal(writer.name, 'test-writer');
  assert.doesNotMatch(reviewer.tools, /Edit|Write|Bash/, 'the reviewer must stay read-only');
  assert.match(writer.tools, /Write/);
});

test('shell scripts have valid syntax', () => {
  for (const rel of ['shell/bashrc', '.githooks/pre-commit']) {
    const { status, stderr } = spawnSync(BASH, ['-n', join(ROOT, rel)], { encoding: 'utf8' });
    assert.equal(status, 0, `${rel}: ${stderr}`);
  }
});

test('PowerShell scripts parse without errors', { skip: process.platform !== 'win32' }, () => {
  for (const rel of ['install.ps1', 'sync-settings.ps1', 'shell/powershell_profile.ps1']) {
    const script =
      `$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${join(ROOT, rel)}',[ref]$t,[ref]$e);` +
      `if($e.Count){$e|ForEach-Object{$_.Message};exit 1}`;
    const { status, stdout } = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
    assert.equal(status, 0, `${rel}: ${stdout}`);
  }
});

test('repo templates carry the expected rules', () => {
  assert.match(read('templates/repo/gitattributes.template'), /^\* text=auto eol=lf$/m);
  assert.match(read('templates/repo/gitignore.template'), /^!\.env\.example$/m);
  assert.match(read('templates/repo/editorconfig.template'), /end_of_line = lf/);
});

test('biome.json template is accepted by Biome and enforces noExplicitAny', { skip: !hasTool('biome', ['--version']) && 'biome not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'biome-'));
  try {
    copyFileSync(join(ROOT, 'templates/repo/biome.json'), join(dir, 'biome.json'));
    // The template reads the repo's ignore file (vcs.useIgnoreFile), so a repo needs a .gitignore.
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(dir, 'ok.ts'), 'export const a = (n: number): number => n + 1;\n');
    const ok = spawnSync('biome', ['check', 'ok.ts'], { cwd: dir, shell: true, encoding: 'utf8' });
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
    writeFileSync(join(dir, 'bad.ts'), 'export const b = (x: any): any => x;\n');
    const bad = spawnSync('biome', ['check', 'bad.ts'], { cwd: dir, shell: true, encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'noExplicitAny should fail the check');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ruff.toml template is accepted by Ruff and enables security rules', { skip: !hasTool('ruff', ['--version']) && 'ruff not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ruff-'));
  try {
    copyFileSync(join(ROOT, 'templates/repo/ruff.toml'), join(dir, 'ruff.toml'));
    writeFileSync(join(dir, 'ok.py'), 'def add(a: int, b: int) -> int:\n    return a + b\n');
    const ok = spawnSync('ruff', ['check', 'ok.py'], { cwd: dir, shell: true, encoding: 'utf8' });
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
    writeFileSync(join(dir, 'bad.py'), 'result = eval("1 + 1")\n');
    const bad = spawnSync('ruff', ['check', 'bad.py'], { cwd: dir, shell: true, encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'bandit rules (S) should flag eval');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
