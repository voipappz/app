import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortalSidebarProvider, usePortalSidebar } from './PortalSidebarContext';

const admin = vi.fn();
const portal = vi.fn();
vi.mock('./AuthContext', () => ({ useAuth: () => admin() }));
vi.mock('./UserAuthContext', () => ({ useUserAuth: () => portal() }));

const wrapper = ({ children }) => <PortalSidebarProvider>{children}</PortalSidebarProvider>;

describe('PortalSidebarContext phone view', () => {
  it('opens for a signed-in portal user', () => {
    admin.mockReturnValue({ isAuthenticated: false });
    portal.mockReturnValue({ isAuthenticated: true });
    const { result } = renderHook(() => usePortalSidebar(), { wrapper });

    act(() => result.current.toggle('phone'));

    expect(result.current.view).toBe('phone');
  });

  it('opens for a signed-in account', () => {
    admin.mockReturnValue({ isAuthenticated: true });
    portal.mockReturnValue({ isAuthenticated: false });
    const { result } = renderHook(() => usePortalSidebar(), { wrapper });

    act(() => result.current.open('phone'));

    expect(result.current.view).toBe('phone');
  });

  it('stays closed when nobody is signed in', () => {
    admin.mockReturnValue({ isAuthenticated: false });
    portal.mockReturnValue({ isAuthenticated: false });
    const { result } = renderHook(() => usePortalSidebar(), { wrapper });

    act(() => result.current.toggle('phone'));

    expect(result.current.view).toBeNull();
  });
});
