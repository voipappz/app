import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioLevel } from './useAudioLevel';

// A fake AudioContext whose analyser reports one fixed level.
let level = 0;
class FakeAnalyser {
  frequencyBinCount = 4;
  getByteFrequencyData(arr) { arr.fill(level); }
  connect() {}
  disconnect() {}
}
class FakeAudioContext {
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() { return new FakeAnalyser(); }
  close() { return Promise.resolve(); }
}
const stream = { getAudioTracks: () => [{}] };

beforeEach(() => {
  level = 0;
  window.AudioContext = FakeAudioContext;
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 16));
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete window.AudioContext; });

describe('useAudioLevel', () => {
  it('is silent without a stream', () => {
    const { result } = renderHook(() => useAudioLevel(null));
    expect(result.current).toEqual({ level: 0, speaking: false });
  });

  it('reports speech and a rising level, then silence when the sound stops', () => {
    level = 60;
    const { result } = renderHook(() => useAudioLevel(stream));
    act(() => { vi.advanceTimersByTime(16 * 6); });
    expect(result.current.speaking).toBe(true);
    expect(result.current.level).toBeGreaterThan(0.5);
    level = 0;
    act(() => { vi.advanceTimersByTime(16 * 12); });
    expect(result.current.speaking).toBe(false);
    expect(result.current.level).toBeLessThan(0.1);
  });
});
