#!/usr/bin/env node
// Repository hygiene gate (part of `npm run check`).
//
// Scans the would-be-committed file set, which is
//   git ls-files --cached --others --exclude-standard
// so it works before the first commit, and fails when:
//   1. a path is, or sits under, a local agent-layer path, or is a renamed copy
//      of one (these stay gitignored);
//   2. a Markdown link is broken or points into an agent-layer path, or a JS/TS
//      import specifier points into an agent-layer path;
//   3. a text file contains CJK characters (the repository is English-only);
//   4. a text file contains an absolute Windows path;
//   5. a generated file differs from a fresh `node scripts/gen-docs.mjs`
//      (docs/parameters.md, apps/web/public/schema/v1.json,
//      apps/web/public/third-party-notices.txt); gen-docs first builds the
//      engine core incrementally, so this also works on a fresh clone;
//   6. a text file names a file of the private original renderer (its Python
//      modules or its race data file), or code under apps/ or packages/ cites
//      the local-only design spec by section ("(spec 4.8)") or refers to the
//      local decision records ("owner decision", "fidelity ledger"):
//      committed code describes behaviour, not where a private or local
//      document keeps it;
//   7. a file looks like a credential (key files, tool configuration that holds
//      tokens), or a text file contains a private key, a token in a well-known
//      format, an e-mail address, a private network address or a home-folder
//      path: the repository holds no secrets and no personal data.
//
// No dependencies. Patterns that would trip rules 3, 4, 6 and 7 on this very
// file are built from escapes and string pieces.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Mirrors the "Local agent layer and AI docs" block of .gitignore (which uses
// globs for the two entry files and the docs folder; AGENT_COPY_RE below covers
// those). The patterns have no leading slash, so they match at any depth.
const AGENT_NAMES = [
  'AGENTS.md',
  'AGENTS.override.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  '.claude',
  '.codex',
  '.agents',
  '.agent',
  'ai-docs',
  'cache',
  'lan',
  '.mcp.json',
  '.claude.json',
];
const AGENT_SET = new Set(AGENT_NAMES.map((name) => name.toLowerCase()));
// Renamed copies and backups of the two entry files and of the local docs
// folder ("<name>.md.bak", "<name>-old.md", "<name> copy.md", "ai-docs.old").
const AGENT_COPY_RE = /^(?:agents|claude)(?:[ ._-][^/]*)?\.md(?:\.[^/]+)?$|^ai-docs[^/]+$/i;

const BINARY_EXTENSIONS = new Set([
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
  '.ico',
]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

// CJK and Hangul code points, applied to every text file (lockfile included):
//   U+1100-U+11FF   Hangul Jamo
//   U+2E80-U+2FFF   CJK and Kangxi radicals, ideographic description characters
//   U+3000-U+9FFF   CJK symbols, kana, Hangul compatibility jamo, unified ideographs
//   U+A960-U+A97F   Hangul Jamo Extended-A
//   U+AC00-U+D7FF   Hangul syllables and Hangul Jamo Extended-B
//   U+F900-U+FAFF   CJK compatibility ideographs
//   U+FE30-U+FE4F   CJK compatibility forms
//   U+FF00-U+FFEF   half- and full-width forms
//   U+20000-U+3FFFF supplementary ideographs (planes 2 and 3)
// Escapes keep this file ASCII.
const CJK_RE =
  /[\u1100-\u11FF\u2E80-\u2FFF\u3000-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u{20000}-\u{3FFFF}]/u;
// A drive letter, a colon, then a slash or backslash. The colon comes from a
// char code so this line never matches itself.
const WIN_PATH_RE = new RegExp(`\\b[A-Za-z]${String.fromCharCode(58)}[\\\\/]`);

// The private renderer's module and data file names, assembled from pieces so
// this file never contains them.
const PRIVATE_FILE_RE = new RegExp(
  `\\b(?:${['map' + 'viz', 'vg' + 'fx', 'graph' + 'ics'].join('|')})\\.p${'y'}\\b|\\braces\\.ya${'ml'}\\b`,
);

// A citation of the local design spec by section number, such as "(spec 4.8)" or
// "(design spec section 7)"; checked under apps/ and packages/ only.
const SPEC_REF_RE = new RegExp(String.raw`\((?:design )?${'sp' + 'ec'}(?: section)? \d`, 'i');

// Wording that points at the local-only decision records; checked under apps/
// and packages/ only.
const LOCAL_REF_RE = new RegExp(
  String.raw`\b(?:${'owner' + ' decision'}|${'fidelity' + ' ledger'})\b`,
  'i',
);

// Rule 7. File names that hold credentials; ".env.example" is the one exception.
const SECRET_FILE_RE =
  /(?:^|\/)(?:\.npmrc|\.netrc|\.envrc|\.env(?:\.[^/]+)?|[^/]*\.(?:pem|key|p12|pfx)|id_(?:rsa|ed25519)[^/]*)$/i;
// Text that must never be committed. Each pattern is written so that it does
// not match its own source line.
const SECRET_TEXT = [
  ['a private key', new RegExp(`-----BEGIN [A-Z ]*${'PRIV' + 'ATE'} KEY-----`)],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['an npm token', /\bnpm_[A-Za-z0-9]{30,}/],
  ['an npm auth setting', new RegExp(`_${'auth'}(?:Token)?\\s*=\\s*\\S`)],
  ['an AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
];
// An e-mail address. Scoped package names ("@scope/name") and versions
// ("name@1.2.3") have no dotted alphabetic domain and do not match.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
// Addresses that are not personal: documentation domains, GitHub's no-reply
// addresses, the "git@host" form of a clone address and "name@2x.png" assets.
const EMAIL_ALLOW_RE =
  /@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)$|^git@|@\d+x\.[a-z]+$/i;
// The three private IPv4 ranges (RFC 1918).
const PRIVATE_IP_RE = /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/;
// "/Users/<name>/" and "/home/<name>/".
const HOME_PATH_RE = new RegExp(`/(?:${'Us' + 'ers'}|${'ho' + 'me'})/[A-Za-z0-9._-]+/`);
// The lockfile is generated and names only packages and registry addresses.
const LOCKFILE = 'package-lock.json';

const SCHEME_RE = /^[a-z][a-z0-9+.-]+:/i;

/** @type {Map<number, string[]>} */
const violations = new Map([
  [1, []],
  [2, []],
  [3, []],
  [4, []],
  [5, []],
  [6, []],
  [7, []],
]);

/**
 * @param {1 | 2 | 3 | 4 | 5 | 6 | 7} rule
 * @param {string} message
 */
function fail(rule, message) {
  violations.get(rule)?.push(message);
}

/** @returns {string[]} repo-relative POSIX paths */
function listFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return [...new Set(out.split('\0').filter(Boolean))].sort();
}

/**
 * Returns the agent-layer segment a repo-relative path runs through, if any.
 * @param {string} relPath
 * @returns {string | undefined}
 */
function agentSegment(relPath) {
  return relPath
    .split('/')
    .find(
      (segment) =>
        segment !== '' && (AGENT_SET.has(segment.toLowerCase()) || AGENT_COPY_RE.test(segment)),
    );
}

/**
 * @param {string} rel
 * @returns {Buffer | undefined}
 */
function readRepoFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) {
    return undefined;
  }
  return readFileSync(abs);
}

/**
 * Blanks out fenced code blocks and inline code spans, keeping line numbers.
 * @param {string} text
 * @returns {string[]}
 */
function markdownProseLines(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string | undefined} */
  let fence;
  return lines.map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      return '';
    }
    if (marker !== undefined) {
      fence = marker;
      return '';
    }
    return line.replace(/(`+)[^`]*?\1/g, '');
  });
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function markdownTargets(line) {
  const targets = [];
  for (const m of line.matchAll(/\]\(\s*(<[^>]*>|[^\s)]+)/g)) {
    targets.push(m[1] ?? '');
  }
  const def = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(line);
  if (def?.[1]) {
    targets.push(def[1]);
  }
  for (const m of line.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    targets.push(m[1] ?? '');
  }
  return targets.map((t) => (t.startsWith('<') && t.endsWith('>') ? t.slice(1, -1) : t));
}

/**
 * @param {string} fromFile repo-relative path of the file holding the reference
 * @param {string} target already stripped of anchors and queries
 * @returns {string} normalized repo-relative POSIX path ('' is the root)
 */
function resolveRepoPath(fromFile, target) {
  const joined = target.startsWith('/')
    ? target.slice(1)
    : path.posix.join(path.posix.dirname(fromFile), target);
  const normalized = path.posix.normalize(joined).replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}

/**
 * @param {string[]} files
 * @param {Set<string>} fileSet
 * @param {Set<string>} dirSet
 */
function checkMarkdownLinks(files, fileSet, dirSet) {
  for (const rel of files.filter((f) => f.toLowerCase().endsWith('.md'))) {
    const buf = readRepoFile(rel);
    if (!buf) {
      continue;
    }
    markdownProseLines(buf.toString('utf8')).forEach((line, index) => {
      for (const raw of markdownTargets(line)) {
        const where = `${rel}:${index + 1}`;
        if (raw === '' || raw.startsWith('#') || raw.startsWith('//') || SCHEME_RE.test(raw)) {
          continue;
        }
        let target = raw.replace(/[#?].*$/, '');
        try {
          target = decodeURIComponent(target);
        } catch {
          // Keep the raw form; the existence check below reports it.
        }
        if (target === '') {
          continue;
        }
        const resolved = resolveRepoPath(rel, target);
        if (resolved === '..' || resolved.startsWith('../')) {
          fail(2, `${where}: link "${raw}" leaves the repository`);
          continue;
        }
        const segment = agentSegment(resolved);
        if (segment) {
          fail(2, `${where}: link "${raw}" points into local-only path "${segment}"`);
          continue;
        }
        if (resolved !== '' && !fileSet.has(resolved) && !dirSet.has(resolved)) {
          fail(2, `${where}: broken link "${raw}" (no committed file at ${resolved})`);
        }
      }
    });
  }
}

const IMPORT_PATTERNS = [
  /\bfrom\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1/g,
  /\brequire\s*\(\s*(['"])([^'"\n]+)\1/g,
  /\bnew\s+URL\s*\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url/g,
];

/** @param {string[]} files */
function checkImports(files) {
  for (const rel of files.filter((f) => CODE_EXTENSIONS.has(path.posix.extname(f).toLowerCase()))) {
    const buf = readRepoFile(rel);
    if (!buf) {
      continue;
    }
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        for (const pattern of IMPORT_PATTERNS) {
          for (const m of line.matchAll(pattern)) {
            const spec = m[2] ?? '';
            if (!spec.startsWith('.') && !spec.startsWith('/')) {
              continue; // bare package specifiers resolve into node_modules
            }
            const segment = agentSegment(resolveRepoPath(rel, spec));
            if (segment) {
              fail(
                2,
                `${rel}:${index + 1}: import "${spec}" points into local-only path "${segment}"`,
              );
            }
          }
        }
      });
  }
}

/** @param {string[]} files */
function checkText(files) {
  for (const rel of files) {
    const ext = path.posix.extname(rel).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }
    const buf = readRepoFile(rel);
    if (!buf || buf.includes(0)) {
      continue; // deleted in the working tree, or binary content
    }
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        const where = `${rel}:${index + 1}`;
        const cjk = CJK_RE.exec(line);
        if (cjk) {
          const code = cjk[0].codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0');
          fail(3, `${where}: CJK character U+${code}`);
        }
        const win = WIN_PATH_RE.exec(line);
        if (win) {
          const snippet = line.slice(win.index, win.index + 40).trim();
          fail(4, `${where}: absolute Windows path "${snippet}"`);
        }
        for (const [what, pattern] of SECRET_TEXT) {
          if (pattern.test(line)) {
            fail(7, `${where}: looks like ${what}; secrets are never committed`);
          }
        }
        if (rel !== LOCKFILE) {
          for (const m of line.matchAll(EMAIL_RE)) {
            if (!EMAIL_ALLOW_RE.test(m[0])) {
              fail(7, `${where}: e-mail address "${m[0]}"; committed files hold no personal data`);
            }
          }
          const ip = PRIVATE_IP_RE.exec(line);
          if (ip) {
            fail(7, `${where}: private network address "${ip[0]}"`);
          }
          const home = HOME_PATH_RE.exec(line);
          if (home) {
            fail(7, `${where}: home-folder path "${home[0]}"`);
          }
        }
        const priv = PRIVATE_FILE_RE.exec(line);
        if (priv) {
          fail(
            6,
            `${where}: names the private renderer file "${priv[0]}"; describe the behaviour instead`,
          );
        }
        if (/^(?:apps|packages)\//.test(rel)) {
          const spec = SPEC_REF_RE.exec(line);
          if (spec) {
            fail(
              6,
              `${where}: cites the local design spec ("${line.slice(spec.index, spec.index + 24).trim()}"); describe the behaviour instead`,
            );
          }
          const local = LOCAL_REF_RE.exec(line);
          if (local) {
            fail(
              6,
              `${where}: refers to the local decision records ("${local[0]}"); describe the behaviour instead`,
            );
          }
        }
      });
  }
}

function checkGeneratedDocs() {
  const genDocs = path.join(ROOT, 'scripts', 'gen-docs.mjs');
  if (!existsSync(genDocs)) {
    fail(5, 'scripts/gen-docs.mjs is missing, so the generated files cannot be checked');
    return;
  }
  try {
    execFileSync(process.execPath, [genDocs, '--check'], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim();
    fail(
      5,
      `generated files are stale or could not be generated; run "npm run docs:gen"${detail ? `\n    ${detail}` : ''}`,
    );
  }
}

function main() {
  const files = listFiles();
  const fileSet = new Set(files);
  const dirSet = new Set();
  for (const file of files) {
    let dir = path.posix.dirname(file);
    while (dir !== '.' && !dirSet.has(dir)) {
      dirSet.add(dir);
      dir = path.posix.dirname(dir);
    }
  }

  for (const rel of files) {
    const segment = agentSegment(rel);
    if (segment) {
      fail(1, `${rel}: local-only path "${segment}" must stay gitignored`);
    }
    if (SECRET_FILE_RE.test(rel) && !rel.endsWith('.env.example')) {
      fail(7, `${rel}: credential or key files are never committed`);
    }
  }
  checkMarkdownLinks(files, fileSet, dirSet);
  checkImports(files);
  checkText(files);
  checkGeneratedDocs();

  const labels = new Map([
    [1, 'local-only paths'],
    [2, 'links and imports'],
    [3, 'CJK characters'],
    [4, 'absolute Windows paths'],
    [5, 'generated docs'],
    [6, 'private renderer names and design-spec citations'],
    [7, 'secrets and personal data'],
  ]);
  let total = 0;
  for (const [rule, messages] of violations) {
    for (const message of messages) {
      console.error(`[rule ${rule}] ${message}`);
    }
    total += messages.length;
  }
  const counts = [...violations]
    .map(([rule, messages]) => `${labels.get(rule)} ${messages.length}`)
    .join(', ');
  if (total > 0) {
    console.error(
      `check-hygiene: FAILED, ${total} violation(s) in ${files.length} files (${counts})`,
    );
    process.exitCode = 1;
  } else {
    console.log(`check-hygiene: OK, ${files.length} files clean (${counts})`);
  }
}

main();
