import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useLayoutSize from './useLayoutSize';
import { pretendScreenWidth } from '../test/screenWidth';

let backToDefault = () => {};
afterEach(() => backToDefault());

describe('useLayoutSize', () => {
  it.each([
    [375, 'phone'],
    [768, 'tablet'],
    [1024, 'tablet'],
    [1440, 'desktop'],
  ])('calls a %ipx screen a %s', (width, size) => {
    backToDefault = pretendScreenWidth(width);
    expect(renderHook(() => useLayoutSize()).result.current).toBe(size);
  });
});
