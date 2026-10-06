import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsUserSession, useSessionRole } from './useIsUserSession';

let admin = false;
let user = false;
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: admin }) }));
vi.mock('../context/UserAuthContext', () => ({ useUserAuth: () => ({ isAuthenticated: user }) }));

describe('useIsUserSession', () => {
  it('is true for a portal user', () => {
    admin = false; user = true;
    expect(renderHook(() => useIsUserSession()).result.current).toBe(true);
  });
  // A browser holding both keeps the admin session (sessionIsolation).
  it('is false for an account, and when both are present', () => {
    admin = true; user = true;
    expect(renderHook(() => useIsUserSession()).result.current).toBe(false);
    admin = true; user = false;
    expect(renderHook(() => useIsUserSession()).result.current).toBe(false);
  });
});

describe('useSessionRole', () => {
  it('names the signed-in side, the account winning when both are present', () => {
    admin = true; user = false;
    expect(renderHook(() => useSessionRole()).result.current).toBe('admin');
    admin = false; user = true;
    expect(renderHook(() => useSessionRole()).result.current).toBe('user');
    admin = true; user = true;
    expect(renderHook(() => useSessionRole()).result.current).toBe('admin');
  });
  it('is null when nobody is signed in', () => {
    admin = false; user = false;
    expect(renderHook(() => useSessionRole()).result.current).toBe(null);
  });
});
