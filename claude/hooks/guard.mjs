#!/usr/bin/env node
/**
 * PreToolUse guard. Reads the hook payload from stdin and asks the user for
 * approval (permissionDecision "ask") before: git/gh writes, secret reads,
 * destructive commands and dependency installs.
 *
 * It is a safety net, not a security boundary: regexes cannot catch every
 * clever command. Any internal failure allows the call (exit 0, no output).
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const START = String.raw`(?:^|[;&|(\s])`;

/** Command patterns grouped by category; the first match wins. */
const COMMAND_RULES = [
  {
    category: 'git/gh write',
    patterns: [
      new RegExp(
        START +
          String.raw`git\s+(?:(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?)\s+)*` +
          String.raw`(?:commit|push|reset|rebase|clean|merge|cherry-pick|revert|tag|am|restore|update-ref|checkout\s+--|branch\s+-[dD]|stash\s+(?:drop|clear))(?![\w-])`,
      ),
      new RegExp(
        START +
          String.raw`gh\s+(?:pr\s+(?:create|merge|close)|repo\s+(?:create|delete)|release\s+create|api\s+-X\s*(?:POST|PUT|PATCH|DELETE))\b`,
        'i',
      ),
    ],
  },
  {
    category: 'secret access',
    patterns: [
      // .env, .env.<name> and .env* globs, but not .env.example/.sample/.template/.dist
      /(?:^|[\s"'=\/\\])\.env(?:\.(?!(?:example|sample|template|dist)(?:$|[\s"'|;&)<>]))[\w.-]+)?(?=$|[\s"'|;&)<>*?]|\.\*)/i,
      /(?:^|[\s"'=\/\\~])\.ssh(?:[\/\\]|(?=$|[\s"']))/,
      /\.(?:pem|key|p12|pfx)(?=$|[\s"'|;&)])/i,
      /\bid_(?:rsa|dsa|ecdsa|ed25519)\b/,
      /\.aws[\/\\]credentials/i,
      /(?:^|[\s"'\/\\])\.netrc\b/,
    ],
  },
  {
    category: 'destructive command',
    patterns: [
      new RegExp(START + String.raw`rm\s+(?:\S+\s+)*?(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b`),
      /\bRemove-Item\b[^\n|;]*-Recurse/i,
      new RegExp(START + String.raw`(?:rd|rmdir)\s+\/s\b`, 'i'),
      new RegExp(START + String.raw`del\s+\/[sq]\b`, 'i'),
      /\bdocker\s+(?:system|volume|container|image|builder)\s+prune\b/,
      /\bdrop\s+(?:database|table|schema)\b/i,
      /\btruncate\s+table\b/i,
    ],
  },
  {
    category: 'dependency install',
    patterns: [
      new RegExp(START + String.raw`(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|remove|rm|uninstall|update|upgrade|ci|link)\b`),
      new RegExp(START + String.raw`uv\s+(?:add|remove|sync|lock|pip\s+install|tool\s+install)\b`),
      /\b(?:pip3?|python3?(?:\.\d+)?\s+-m\s+pip)\s+install\b/,
      /\b(?:winget|choco|scoop)\s+(?:install|upgrade|uninstall)\b/,
      /\b(?:cargo|go)\s+install\b/,
      /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
      /\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(?:iex|Invoke-Expression)\b/i,
    ],
  },
];

const SECRET_COMMAND_PATTERNS = COMMAND_RULES.find((r) => r.category === 'secret access').patterns;

/**
 * Whether a file path points at a secret (env file, SSH material, key files).
 * @param {string} path
 */
function isSecretPath(path) {
  const normalized = path.replace(/\\/g, '/');
  const name = basename(normalized);
  if (/^\.env(\..+)?$/i.test(name) && !/\.(example|sample|template|dist)$/i.test(name)) return true;
  if (/(^|\/)\.ssh(\/|$)/.test(normalized)) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(name)) return true;
  if (/(^|\/)\.aws\/credentials$/i.test(normalized)) return true;
  return name === '.netrc';
}

/**
 * Decide whether a tool call needs the user's approval.
 * @param {string} toolName
 * @param {Record<string, unknown>} input
 * @returns {string | null} The reason to ask, or null to allow.
 */
function evaluate(toolName, input) {
  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    for (const rule of COMMAND_RULES) {
      if (rule.patterns.some((p) => p.test(command))) return `${rule.category}: ${command.slice(0, 200)}`;
    }
    return null;
  }
  if (toolName === 'Read') {
    const path = typeof input.file_path === 'string' ? input.file_path : '';
    return path && isSecretPath(path) ? `secret access: reading ${path}` : null;
  }
  if (toolName === 'Grep' || toolName === 'Glob') {
    const targets = [input.path, input.glob, toolName === 'Glob' ? input.pattern : undefined]
      .filter((v) => typeof v === 'string')
      .join(' ');
    if (!targets) return null;
    const hit = SECRET_COMMAND_PATTERNS.some((p) => p.test(targets)) || isSecretPath(targets.trim());
    return hit ? `secret access: ${toolName} on ${targets.slice(0, 200)}` : null;
  }
  return null;
}

try {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const reason = evaluate(payload.tool_name, payload.tool_input ?? {});
  if (reason) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `Guard (${reason}). Approve only if you intended this.`,
        },
      }),
    );
  }
} catch {
  // Never block work because the guard itself failed.
}
