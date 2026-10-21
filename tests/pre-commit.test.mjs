import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../.githooks/pre-commit', import.meta.url));
const GIT_BASH = join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
const BASH = existsSync(GIT_BASH) ? GIT_BASH : 'bash';
const gitleaksAvailable = spawnSync('gitleaks', ['version'], { shell: true }).status === 0;

// Fake secrets are assembled at runtime so this file never contains a full one.
const FAKE = {
  privateKey: `-----BEGIN ${'RSA PRIVATE'} KEY-----`,
  githubToken: `gh${'p_'}${'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5'}`,
  awsKey: `AK${'IA'}${'IOSFODNN7EXAMPLQ'}`,
};

/** Create a repo (with a space in its path), stage `files`, and run the hook. */
function runHook(files, { fallback }) {
  const repo = mkdtempSync(join(tmpdir(), 'pre commit-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: repo });
    mkdirSync(join(repo, 'hooks'));
    copyFileSync(HOOK, join(repo, 'hooks', 'pre-commit'));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, name), content);
    spawnSync('git', ['add', '-A', '--', ...Object.keys(files)], { cwd: repo });
    const env = { ...process.env, ...(fallback ? { PRECOMMIT_NO_GITLEAKS: '1' } : {}) };
    const result = spawnSync(BASH, [join(repo, 'hooks', 'pre-commit')], { cwd: repo, env, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

for (const fallback of [true, false]) {
  const mode = fallback ? 'pattern fallback' : 'gitleaks';
  const skip = !fallback && !gitleaksAvailable ? 'gitleaks not installed' : false;

  test(`${mode}: allows clean changes`, { skip }, () => {
    const { status, output } = runHook({ 'a.ts': 'export const a = 1;\n' }, { fallback });
    assert.equal(status, 0, output);
  });

  test(`${mode}: blocks a GitHub token`, { skip }, () => {
    const { status } = runHook({ 'config.txt': `token = ${FAKE.githubToken}\n` }, { fallback });
    assert.notEqual(status, 0);
  });

  test(`${mode}: blocks a private key`, { skip }, () => {
    const body = `${FAKE.privateKey}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END RSA PRIVATE KEY-----\n`;
    const { status } = runHook({ 'notes.txt': body }, { fallback });
    assert.notEqual(status, 0);
  });
}

test('pattern fallback: blocks an AWS access key id', () => {
  const { status } = runHook({ 'c.txt': `aws = ${FAKE.awsKey}\n` }, { fallback: true });
  assert.notEqual(status, 0);
});

test('blocks secret-looking filenames in both modes, allows examples', () => {
  for (const fallback of [true, false]) {
    for (const name of ['.env', '.env.production', 'server.pem', 'id_ed25519']) {
      const { status, output } = runHook({ [name]: 'x\n' }, { fallback });
      assert.notEqual(status, 0, `${name} should be refused (fallback=${fallback})\n${output}`);
    }
    for (const name of ['.env.example', '.env.template']) {
      const { status, output } = runHook({ [name]: 'KEY=\n' }, { fallback });
      assert.equal(status, 0, `${name} should be allowed (fallback=${fallback})\n${output}`);
    }
  }
});
