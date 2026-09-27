import { describe, expect, it } from 'vitest';
import { reportsViewFor } from './reportsView';

describe('Reports landing view', () => {
  it('opens on the Visual dashboards', () => {
    expect(reportsViewFor(new URLSearchParams(''))).toBe('visual');
  });

  it('opens a ?report= link in the Editor', () => {
    expect(reportsViewFor(new URLSearchParams('report=47923bfc-6d8c-429d-8d28-a18ad2fb64d7'))).toBe('editor');
  });
});
