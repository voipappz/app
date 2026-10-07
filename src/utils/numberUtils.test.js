import { describe, it, expect } from 'vitest';
import { formatNumber } from './numberUtils';

describe('formatNumber', () => {
  it('groups thousands, as the balance column always did', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
  });
});
