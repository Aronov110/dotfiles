import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INSTALL = join(ROOT, 'install.ps1');
const skip = process.platform !== 'win32' ? 'install.ps1 targets Windows' : false;

/** Run install.ps1 against a throwaway home so the real config is never touched. */
function install(home) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INSTALL],
    {
      encoding: 'utf8',
      env: { ...process.env, USERPROFILE: home, HOME: home, APPDATA: join(home, 'AppData', 'Roaming') },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const countOccurrences = (text, needle) => text.split(needle).length - 1;

test('links config, appends shell sources, keeps existing content', { skip }, () => {
  const home = mkdtempSync(join(tmpdir(), 'dotfiles-home-'));
  try {
    writeFileSync(join(home, '.bashrc'), 'export FOO=1\n');
    mkdirSync(join(home, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(home, '.claude', 'hooks', 'old.txt'), 'old');

    const first = install(home);
    assert.equal(first.status, 0, first.output);

    for (const name of ['hooks', 'templates', 'commands', 'agents']) {
      const link = join(home, '.claude', name);
      assert.ok(lstatSync(link).isSymbolicLink(), `${name} should be a junction`);
      assert.equal(realpathSync(link), realpathSync(join(ROOT, 'claude', name)));
    }
    const md = join(home, '.claude', 'CLAUDE.md');
    assert.equal(readFileSync(md, 'utf8'), readFileSync(join(ROOT, 'claude', 'CLAUDE.md'), 'utf8'));
    assert.ok(statSync(md).nlink >= 2, 'CLAUDE.md should be a hard link');
    assert.ok(existsSync(join(home, '.claude', 'settings.json')));

    const backups = readdirSync(join(home, '.claude')).filter((n) => n.startsWith('hooks.bak-'));
    assert.equal(backups.length, 1);
    assert.ok(existsSync(join(home, '.claude', backups[0], 'old.txt')), 'existing hooks dir is backed up, not lost');

    const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
    assert.match(bashrc, /export FOO=1/);
    assert.match(bashrc, /shell\/bashrc/);
    const psProfile = readFileSync(join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'), 'utf8');
    assert.match(psProfile, /powershell_profile\.ps1/);

    const gitconfig = readFileSync(join(home, '.gitconfig'), 'utf8');
    assert.match(gitconfig, /\[include\]/);
    assert.match(gitconfig, /git\/gitconfig/);
    assert.match(gitconfig, /excludesfile/);
    assert.doesNotMatch(gitconfig, /\bemail\b/, 'identity must never be written');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('is idempotent: a second run changes nothing', { skip }, () => {
  const home = mkdtempSync(join(tmpdir(), 'dotfiles-home-'));
  try {
    assert.equal(install(home).status, 0);
    const bashrcBefore = readFileSync(join(home, '.bashrc'), 'utf8');
    const gitBefore = readFileSync(join(home, '.gitconfig'), 'utf8');

    const second = install(home);
    assert.equal(second.status, 0, second.output);
    assert.equal(countOccurrences(second.output, 'already linked'), 5);
    assert.equal(readFileSync(join(home, '.bashrc'), 'utf8'), bashrcBefore);
    assert.equal(readFileSync(join(home, '.gitconfig'), 'utf8'), gitBefore);
    const sourceLines = readFileSync(join(home, '.bashrc'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('shell/bashrc'));
    assert.equal(sourceLines.length, 1, 'the source line must appear exactly once');
    assert.equal(readdirSync(join(home, '.claude')).filter((n) => n.includes('.bak-')).length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
