import { describe, it, expect } from 'vitest';

// Every English text needs a Hebrew one, and both must use the same
// placeholders: {{name}} values and <tag/> slots for bold text or links.
const files = import.meta.glob('./locales/*/*.json', { eager: true, import: 'default' });

const leaves = (tree, prefix = '') => Object.entries(tree).flatMap(([key, value]) =>
  (typeof value === 'object' ? leaves(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]));

const placeholders = (text) => (text.match(/{{\s*\w+\s*}}|<\w+\s*\/>/g) || []).sort();

const namespaces = Object.keys(files)
  .filter((path) => path.includes('/en/'))
  .map((path) => path.split('/').pop().replace('.json', ''));

describe.each(namespaces)('%s translations', (namespace) => {
  const english = Object.fromEntries(leaves(files[`./locales/en/${namespace}.json`]));
  const hebrew = Object.fromEntries(leaves(files[`./locales/he/${namespace}.json`]));

  it('has the same keys in English and Hebrew', () => {
    expect(Object.keys(hebrew).sort()).toEqual(Object.keys(english).sort());
  });

  it('has no empty texts', () => {
    const empty = Object.entries({ ...english, ...hebrew }).filter(([, text]) => !String(text).trim());
    expect(empty).toEqual([]);
  });

  it('uses the same placeholders in both languages', () => {
    const mismatched = Object.keys(english).filter(
      (key) => JSON.stringify(placeholders(english[key])) !== JSON.stringify(placeholders(hebrew[key] || '')),
    );
    expect(mismatched).toEqual([]);
  });
});
