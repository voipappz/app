import { describe, expect, it } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import { Dialog, Drawer, Menu, MenuItem } from '@mui/material';
import usePageCovered from './usePageCovered';

// Lets a microtask pass, so a MutationObserver would have reported.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('usePageCovered', () => {
  it('follows a dialog opening and closing', async () => {
    const { result } = renderHook(() => usePageCovered());
    expect(result.current).toBe(false);

    const view = render(<Dialog open>Editing</Dialog>);
    await waitFor(() => expect(result.current).toBe(true));

    view.rerender(<Dialog open={false}>Editing</Dialog>);
    await waitFor(() => expect(result.current).toBe(false));
  });

  // A route's details on a phone, the call details, the live drawer.
  it('counts a drawer, which covers the top bar too', async () => {
    const { result } = renderHook(() => usePageCovered());
    render(<Drawer open anchor="right">Route details</Drawer>);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('does not count a closed drawer kept mounted', async () => {
    const { result } = renderHook(() => usePageCovered());
    render(<Drawer open={false} keepMounted>Menu</Drawer>);
    await settle();
    expect(result.current).toBe(false);
  });

  // A dropdown on a page leaves the top bar in reach.
  it('does not count a menu', async () => {
    const { result } = renderHook(() => usePageCovered());
    render(<Menu open anchorEl={document.body}><MenuItem>One</MenuItem></Menu>);
    await settle();
    expect(result.current).toBe(false);
  });

  // The phone's own drawer is the phone, not something covering it.
  it('does not count the phone drawer', async () => {
    const { result } = renderHook(() => usePageCovered());
    render(<Drawer open data-phone-drawer>Phone</Drawer>);
    await settle();
    expect(result.current).toBe(false);
  });
});
