/**
 * The DevZone menu and search, over the OpenAPI document the API serves.
 *
 * Categories are the contract's tags, written one way ("call_conditions" and
 * "Call Conditions" are one category). An operation with no tag is put under
 * its path's resource (/api/calls/{id} -> "Calls"), so it lands next to its
 * siblings instead of in one "default" heap. Swagger is given the same
 * categories, so the menu and the page always agree.
 *
 * Search is a set of words, every one of which must appear in the operation's
 * method, path, summary, operationId or category — so "post calls" finds
 * POST /api/calls and a category name alone lists that whole category.
 */

export const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
export const GENERAL = 'General';

/** "call_conditions" -> "Call Conditions"; "ACLs" and "AI Integration" stay as they are. */
export const categoryName = (name) => String(name).replace(/[_-]+/g, ' ').trim()
  .split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const resourceOf = (path) => {
  const parts = path.split('/').filter((part) => part && !part.startsWith('{'));
  const resource = parts[0] === 'api' ? parts[1] : parts[0];
  return resource ? categoryName(resource) : GENERAL;
};

export const categoriesOf = (path, operation) => (
  operation.tags?.length ? [...new Set(operation.tags.map(categoryName))] : [resourceOf(path)]
);

const haystackOf = (method, path, operation, category) => (
  [method, path, operation.summary, operation.operationId, category].join(' ').toLowerCase()
);

const eachOperation = (spec, visit) => {
  Object.entries(spec?.paths || {}).forEach(([path, item]) => {
    METHODS.forEach((method) => {
      const operation = item?.[method];
      if (operation) visit(path, method, operation, item);
    });
  });
};

/** Every operation once per category: { tag, path, method, summary, haystack }. */
export function indexOperations(spec) {
  const rows = [];
  eachOperation(spec, (path, method, operation) => {
    categoriesOf(path, operation).forEach((tag) => {
      rows.push({
        tag, path, method, summary: operation.summary || '', haystack: haystackOf(method, path, operation, tag),
      });
    });
  });
  return rows;
}

export const searchWords = (query) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

export const matches = (row, words) => words.every((word) => row.haystack.includes(word));

const byName = (a, b) => a.localeCompare(b);

/** Categories A to Z, each with its operations. */
export function groupByTag(spec, rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.tag)) groups.set(row.tag, []);
    groups.get(row.tag).push(row);
  });
  return [...groups.keys()].sort(byName).map((tag) => ({ tag, operations: groups.get(tag) }));
}

/**
 * The spec Swagger renders: every operation under its category, keeping only
 * those that match the search and the selection (a category, or one
 * operation). With a category selected, an operation is shown under that
 * category alone so Swagger does not list it twice.
 */
export function filterSpec(spec, { words = [], selection = null } = {}) {
  if (!spec) return spec;
  const keep = (row) => matches(row, words)
    && (!selection || (row.tag === selection.tag
      && (!selection.path || (row.path === selection.path && row.method === selection.method))));

  const paths = {};
  const used = new Set();
  eachOperation(spec, (path, method, operation, item) => {
    const tags = categoriesOf(path, operation).filter((tag) => keep({
      tag, path, method, haystack: haystackOf(method, path, operation, tag),
    }));
    if (!tags.length) return;
    if (!paths[path]) {
      paths[path] = Object.fromEntries(Object.entries(item).filter(([key]) => !METHODS.includes(key)));
    }
    const shownTags = selection ? [selection.tag] : tags;
    shownTags.forEach((tag) => used.add(tag));
    paths[path][method] = { ...operation, tags: shownTags };
  });

  const described = new Map((spec.tags || []).map((tag) => [categoryName(tag.name), tag]));
  return {
    ...spec,
    paths,
    tags: [...used].sort(byName).map((name) => ({ ...described.get(name), name })),
  };
}
