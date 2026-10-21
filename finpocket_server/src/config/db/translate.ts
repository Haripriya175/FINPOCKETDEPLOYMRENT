/**
 * Mechanical SQLite → PostgreSQL translation for the existing query layer.
 *
 * Background (Phase A audit): every service/route is written in SQLite dialect
 * with `?` placeholders, and — critically — SQL is NEVER built by string
 * interpolation of user data (verified across src: zero template-literal
 * parameters inside SQL). That makes a quote-aware translation layer safe:
 *
 *   1. Dialect rewrites for the constructs that actually exist in this
 *      codebase (audit-verified): strftime('%Y-%m', …) and INSERT OR IGNORE.
 *   2. `?` → `$1..$n` renumbering that skips string literals, quoted
 *      identifiers, dollar-quoted bodies and comments (a literal '?' inside a
 *      string must never be renumbered).
 *
 * Anything we do NOT know how to translate (INSERT OR REPLACE, PRAGMA,
 * GROUP_CONCAT, …) throws SqlDialectError loudly rather than half-working —
 * per the spec there are no silent fallbacks in the database layer.
 */

export class SqlDialectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlDialectError';
  }
}

/** Match a dollar-quote opener like $tag$ … $tag$ (empty tag allowed). */
const DOLLAR_TAG = /^\$[A-Za-z_0-9]*\$/;

/**
 * Replace string literals / quoted identifiers / comments with spaces so token
 * scans cannot match inside them. Length is NOT preserved (only used for
 * token-level checks, never for extracting fragments).
 */
export function stripLiterals(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];

    // 'string literal' — '' escapes a quote
    if (c === "'") {
      out += ' ';
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { out += ' '; i += 2; continue; }
          i++;
          break;
        }
        out += sql[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // "quoted identifier" — "" escapes a quote
    if (c === '"') {
      out += ' ';
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { out += ' '; i += 2; continue; }
          i++;
          break;
        }
        out += sql[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // -- line comment
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') { out += ' '; i++; }
      continue;
    }

    /* block comment */
    if (c === '/' && sql[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) {
        out += sql[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }

    // $tag$ … $tag$ dollar-quoted body
    if (c === '$') {
      const m = DOLLAR_TAG.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        out += ' '.repeat(tag.length);
        i += tag.length;
        const end = sql.indexOf(tag, i);
        if (end === -1) { out += ' '.repeat(n - i); i = n; }
        else { out += ' '.repeat(end - i); i = end + tag.length; }
        continue;
      }
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * Rewrite `?` placeholders to PostgreSQL's `$1..$n`, skipping everything that
 * is not executable code (strings, identifiers, comments, dollar quotes).
 * Doubled quote escapes are preserved verbatim.
 */
export function renumberPlaceholders(sql: string): string {
  let out = '';
  let count = 0;
  let i = 0;
  const n = sql.length;

  const copyVerbatim = (matcher: (idx: number) => number) => {
    const start = i;
    i = matcher(i);
    out += sql.slice(start, i);
  };

  while (i < n) {
    const c = sql[i];

    if (c === "'") {
      copyVerbatim((idx) => {
        let j = idx + 1;
        while (j < n) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") { j += 2; continue; }
            return j + 1;
          }
          j++;
        }
        return n;
      });
      continue;
    }

    if (c === '"') {
      copyVerbatim((idx) => {
        let j = idx + 1;
        while (j < n) {
          if (sql[j] === '"') {
            if (sql[j + 1] === '"') { j += 2; continue; }
            return j + 1;
          }
          j++;
        }
        return n;
      });
      continue;
    }

    if (c === '-' && sql[i + 1] === '-') {
      copyVerbatim((idx) => {
        let j = idx;
        while (j < n && sql[j] !== '\n') j++;
        return j;
      });
      continue;
    }

    if (c === '/' && sql[i + 1] === '*') {
      copyVerbatim((idx) => {
        let j = idx + 2;
        while (j < n && !(sql[j] === '*' && sql[j + 1] === '/')) j++;
        return Math.min(j + 2, n);
      });
      continue;
    }

    if (c === '$') {
      const m = DOLLAR_TAG.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const start = i;
        let j = i + tag.length;
        const end = sql.indexOf(tag, j);
        i = end === -1 ? n : end + tag.length;
        out += sql.slice(start, i);
        continue;
      }
    }

    if (c === '?') {
      out += `$${++count}`;
      i++;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/** strftime('%Y-%m', expr) → to_char(expr, 'YYYY-MM') — only format used in src. */
function rewriteStrftime(sql: string): string {
  return sql.replace(
    /strftime\(\s*'%Y-%m'\s*,\s*([^()]+?)\s*\)/gi,
    (_m, expr: string) => `to_char(${expr.trim()}, 'YYYY-MM')`
  );
}

/**
 * `transaction_date LIKE 'YYYY-MM-DD%'` (prefix matching against a stored ISO
 * string) — PostgreSQL cannot LIKE a timestamptz, so render it as text first.
 * The parameters at these call sites are `YYYY-MM-DD…` prefixes, which
 * to_char(..., 'YYYY-MM-DD') reproduces exactly.
 */
function rewriteDateLike(sql: string): string {
  return sql.replace(
    /\btransaction_date\s+LIKE\b/gi,
    "to_char(transaction_date, 'YYYY-MM-DD') LIKE"
  );
}

/**
 * INSERT OR IGNORE INTO … → INSERT INTO … ON CONFLICT DO NOTHING.
 * Only applied to statements that START with the construct (all such call
 * sites are single INSERTs — verified by audit).
 */
function rewriteInsertOrIgnore(sql: string): string {
  if (!/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) return sql;
  let out = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
  if (!/\bON\s+CONFLICT\b/i.test(stripLiterals(out))) {
    out = out.replace(/\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }
  return out;
}

/**
 * Translate one SQLite-dialect statement to PostgreSQL.
 * @throws SqlDialectError for constructs with no safe translation.
 */
export function translateToPostgres(sql: string): string {
  const before = stripLiterals(sql);

  if (/\bINSERT\s+OR\s+REPLACE\b/i.test(before)) {
    throw new SqlDialectError(
      'INSERT OR REPLACE is SQLite-only. PostgreSQL repositories must use INSERT … ON CONFLICT ' +
        '(see repositories/postgres_repositories.ts) — refusing to guess a conflict target.'
    );
  }
  if (/\bPRAGMA\b/i.test(before)) {
    throw new SqlDialectError('PRAGMA is SQLite-only and must never run against PostgreSQL.');
  }
  if (/\bGROUP_CONCAT\s*\(/i.test(before)) {
    throw new SqlDialectError('GROUP_CONCAT is SQLite-only; use STRING_AGG on PostgreSQL.');
  }

  let out = rewriteStrftime(sql);
  out = rewriteDateLike(out);
  out = rewriteInsertOrIgnore(out);

  // Any strftime() left after the rewrite uses a format we do not translate.
  if (/\bstrftime\s*\(/i.test(stripLiterals(out))) {
    throw new SqlDialectError(
      "Unsupported SQLite strftime() format — only strftime('%Y-%m', …) is translated. " +
        'Add a rule in db/translate.ts (or use to_char directly).'
    );
  }

  return renumberPlaceholders(out);
}
