import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import UserOnly from './UserOnly.jsx';

let userSession = true;
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => userSession }));

const app = () => render(
  <MemoryRouter initialEntries={['/conversations']}>
    <Routes>
      <Route path="/conversations" element={<UserOnly><div>portal screen</div></UserOnly>} />
      <Route path="/calls" element={<div>calls screen</div>} />
    </Routes>
  </MemoryRouter>
);

describe('UserOnly', () => {
  it('shows the screen to a user session', () => {
    userSession = true;
    app();
    expect(screen.getByText('portal screen')).toBeInTheDocument();
  });

  it('sends an account session to Calls instead', () => {
    userSession = false;
    app();
    expect(screen.getByText('calls screen')).toBeInTheDocument();
    expect(screen.queryByText('portal screen')).toBeNull();
  });
});
