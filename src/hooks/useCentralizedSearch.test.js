import { describe, it, expect } from 'vitest';
import { parseSearchInput } from './useCentralizedSearch';

describe('parseSearchInput', () => {
  it('sends bare text as search[name] by default', () => {
    expect(parseSearchInput('alice', [])).toEqual({ 'search[name]': 'alice' });
  });

  it("sends bare text as the screen's own text param when given one", () => {
    expect(parseSearchInput('97250', [], 'search[inline]')).toEqual({ 'search[inline]': '97250' });
  });

  it('keeps field:value tokens apart from the bare text', () => {
    const segments = [{ name: 'call.caller', label: 'Caller' }];
    expect(parseSearchInput('caller:100 97250', segments, 'search[inline]')).toEqual({
      'search[call.caller]': '100',
      'search[inline]': '97250',
    });
  });
});
