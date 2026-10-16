import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import PhoneSessionSignOut from './PhoneSessionSignOut.jsx';

const h = vi.hoisted(() => ({ logout: vi.fn(), navigate: vi.fn() }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ logout: h.logout }) }));
vi.mock('react-router', () => ({ useNavigate: () => h.navigate }));
beforeEach(() => vi.clearAllMocks());

describe('phone portal sign out', () => {
  it('ends the app session and returns to user sign-in', () => {
    render(<PhoneSessionSignOut inCall={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(h.logout).toHaveBeenCalledOnce();
    expect(h.navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('lets a user cancel signing out during a call', () => {
    render(<PhoneSessionSignOut inCall />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ends the current call');
    expect(h.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    expect(h.logout).not.toHaveBeenCalled();
  });
});
