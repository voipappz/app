import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionRoleBadge from './SessionRoleBadge';

let role = null;
vi.mock('../../hooks/useIsUserSession', () => ({ useSessionRole: () => role }));

describe('SessionRoleBadge', () => {
  it('says ADMIN for an account session', () => {
    role = 'admin';
    render(<SessionRoleBadge />);
    expect(screen.getByTestId('session-role-badge')).toHaveTextContent('Admin');
  });
  it('says USER for a user session', () => {
    role = 'user';
    render(<SessionRoleBadge />);
    expect(screen.getByTestId('session-role-badge')).toHaveTextContent('User');
  });
  it('renders nothing when nobody is signed in', () => {
    role = null;
    const { container } = render(<SessionRoleBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
