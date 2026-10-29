import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import PortalSidebar from './PortalSidebar.jsx';
import { Z } from '../../utils/zIndex';

let sidebar = { view: null, params: null, close: vi.fn() };
vi.mock('../../context/PortalSidebarContext', () => ({ usePortalSidebar: () => sidebar }));
// The phone, and (when asked) a menu it opens, like its presence picker.
let phoneOpensMenu = false;
vi.mock('../Phone/PhoneScreen.jsx', async () => {
  const { Menu, MenuItem } = await vi.importActual('@mui/material');
  return {
    default: ({ initialNumber, device }) => (
      <>
        <div data-testid="phone-screen" data-number={initialNumber || ''} data-device={device?.uuid || ''} />
        {phoneOpensMenu && <Menu open anchorEl={document.body} data-testid="phone-menu"><MenuItem>Available</MenuItem></Menu>}
      </>
    ),
  };
});
vi.mock('../Calls/CallDetailPanel/CallDetailPanel.jsx', () => ({ default: ({ call }) => <div data-testid="call-detail">{call?.uuid}</div> }));

describe('the portal sidebar', () => {
  // The phone opens mid-edit, above any dialog, and its own menus open above
  // it rather than behind it.
  it('opens above every dialog, with its menus above it', () => {
    sidebar = { view: 'phone', params: null, close: vi.fn() };
    phoneOpensMenu = true;
    try {
      render(<PortalSidebar />);
      expect(Number(getComputedStyle(screen.getByTestId('portal-sidebar')).zIndex)).toBe(Z.PHONE);
      expect(Number(getComputedStyle(screen.getByTestId('phone-menu')).zIndex)).toBe(Z.PHONE_POPUP);
    } finally {
      phoneOpensMenu = false;
    }
  });

  it('shows the phone', () => {
    sidebar = { view: 'phone', params: { tab: 'dialpad' }, close: vi.fn() };
    render(<PortalSidebar />);
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('call-detail')).toBeNull();
  });

  // Unmounting the phone to show a call threw away a half-typed number and an
  // open transfer — and would drop an in-progress call's UI the moment someone
  // clicked a row.
  it('keeps the phone mounted while a call is showing', () => {
    sidebar = { view: 'call', params: { call: { uuid: 'call-9' } }, close: vi.fn() };
    render(<PortalSidebar />);
    expect(screen.getByTestId('call-detail')).toHaveTextContent('call-9');
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });

  // A clicked number, or a device an account opened the phone for, reaches the
  // phone through the sidebar's params (useCallNumber / useOpenPhoneAs).
  it('hands the phone the number and the device it was opened with', () => {
    sidebar = { view: 'phone', params: { tab: 'dialpad', number: '0501234567', device: { uuid: 'dev-1' } }, close: vi.fn() };
    render(<PortalSidebar />);
    expect(screen.getByTestId('phone-screen')).toHaveAttribute('data-number', '0501234567');
    expect(screen.getByTestId('phone-screen')).toHaveAttribute('data-device', 'dev-1');
  });

  // The phone opens from the end of the top bar: the right, and the left in
  // Hebrew. The RTL style plugin mirrors the paper's `right: 0` in Hebrew, so
  // the anchor stays 'right' in both languages; picking 'left' for Hebrew as
  // well flipped it twice, back to the right.
  it.each(['ltr', 'rtl'])('anchors to the right and lets the RTL styles mirror it (%s)', (direction) => {
    sidebar = { view: 'phone', params: { tab: 'dialpad' }, close: vi.fn() };
    render(<ThemeProvider theme={createTheme({ direction })}><PortalSidebar /></ThemeProvider>);
    expect(document.querySelector('.MuiDrawer-paper')).toHaveClass('MuiDrawer-paperAnchorRight');
  });
});
