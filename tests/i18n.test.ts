// Every German UI text (HTML data-i18n and t('…') calls) needs an English translation.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { englishKeys } from '../src/i18n';

const root = join(__dirname, '..');
const en = new Set(englishKeys());

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

describe('translations', () => {
  it('HTML texts', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const missing: string[] = [];
    const texts = [...html.matchAll(/<(\w+)[^>]*\sdata-i18n(?:\s[^>]*)?>([^<]*)<\/\1>/g)];
    // Every data-i18n element must be found by the pattern, otherwise the check is meaningless.
    expect(texts.length).toBe((html.match(/\sdata-i18n[\s>]/g) ?? []).length);
    for (const m of texts) {
      const key = decode(m[2]);
      if (key && !en.has(key)) missing.push(key);
    }
    for (const m of html.matchAll(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g)) {
      for (const attr of m[1].split(',')) {
        const v = new RegExp(`\\s${attr}="([^"]*)"`).exec(m[0])?.[1];
        if (v && !en.has(decode(v))) missing.push(decode(v));
      }
    }
    expect(missing).toEqual([]);
  });

  it('t() calls in the code', () => {
    const missing: string[] = [];
    let count = 0;
    for (const file of sourceFiles(join(root, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
        count++;
        if (!en.has(m[1])) missing.push(`${file.split(/[\\/]/).pop()}: ${m[1]}`);
      }
    }
    expect(count).toBeGreaterThan(80);
    expect(missing).toEqual([]);
  });
});
