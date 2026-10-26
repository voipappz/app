import { describe, expect, it } from 'vitest';
import {
  categoryName, filterSpec, groupByTag, indexOperations, matches, searchWords,
} from './openapiIndex.js';

const spec = {
  openapi: '3.0.1',
  tags: [{ name: 'call_conditions', description: 'Time and caller rules' }],
  paths: {
    '/api/calls': { get: { summary: 'List calls' }, post: { summary: 'Start a call', operationId: 'createCall' } },
    '/api/calls/{id}/transcript': { get: { summary: 'Transcript' } },
    '/api/call_conditions': { get: { tags: ['call_conditions'], summary: 'List conditions' } },
    '/api/numbers': { get: { tags: ['Numbers', 'routes'], summary: 'Numbers' }, parameters: [{ name: 'q' }] },
    '/health': { get: { summary: 'Health' } },
  },
};

describe('openapiIndex', () => {
  it('writes category names one way', () => {
    expect(categoryName('call_conditions')).toBe('Call Conditions');
    expect(categoryName('ACLs')).toBe('ACLs');
    expect(categoryName('AI Integration')).toBe('AI Integration');
  });

  it('puts an untagged operation under its path resource, not one default heap', () => {
    const rows = indexOperations(spec);
    const tagOf = (method, path) => rows.filter((r) => r.method === method && r.path === path).map((r) => r.tag);
    expect(tagOf('get', '/api/calls')).toEqual(['Calls']);
    expect(tagOf('get', '/api/calls/{id}/transcript')).toEqual(['Calls']);
    expect(tagOf('get', '/api/call_conditions')).toEqual(['Call Conditions']);
    expect(tagOf('get', '/api/numbers')).toEqual(['Numbers', 'Routes']);
    expect(tagOf('get', '/health')).toEqual(['Health']);
  });

  it('groups categories A to Z', () => {
    expect(groupByTag(spec, indexOperations(spec)).map((g) => g.tag))
      .toEqual(['Call Conditions', 'Calls', 'Health', 'Numbers', 'Routes']);
  });

  it('matches every search word against method, path, summary, operationId and category', () => {
    const rows = indexOperations(spec);
    const found = (q) => rows.filter((r) => matches(r, searchWords(q))).map((r) => `${r.method} ${r.path}`);
    expect(found('post calls')).toEqual(['post /api/calls']);
    expect(found('createcall')).toEqual(['post /api/calls']);
    expect(found('  TRANSCRIPT ')).toEqual(['get /api/calls/{id}/transcript']);
  });

  it('gives Swagger the same categories as the menu, with the contract descriptions', () => {
    const shown = filterSpec(spec);
    expect(shown.paths['/api/calls'].get.tags).toEqual(['Calls']);
    expect(shown.tags.map((t) => t.name)).toEqual(['Call Conditions', 'Calls', 'Health', 'Numbers', 'Routes']);
    expect(shown.tags.find((t) => t.name === 'Call Conditions').description).toBe('Time and caller rules');
  });

  it('keeps only the selected category, listing each operation once', () => {
    const shown = filterSpec(spec, { selection: { tag: 'Routes' } });
    expect(Object.keys(shown.paths)).toEqual(['/api/numbers']);
    expect(shown.paths['/api/numbers'].get.tags).toEqual(['Routes']);
    expect(shown.paths['/api/numbers'].parameters).toEqual([{ name: 'q' }]);
  });

  it('keeps one operation when one is selected', () => {
    const shown = filterSpec(spec, { selection: { tag: 'Calls', path: '/api/calls', method: 'post' } });
    expect(Object.keys(shown.paths)).toEqual(['/api/calls']);
    expect(Object.keys(shown.paths['/api/calls'])).toEqual(['post']);
  });

  it('leaves no paths when nothing matches', () => {
    expect(filterSpec(spec, { words: ['nothing-like-this'] }).paths).toEqual({});
  });
});
