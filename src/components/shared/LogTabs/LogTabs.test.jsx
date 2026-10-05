import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import LogTabs from './LogTabs.jsx';

let granted = ['calls', 'messages'];
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: (key) => granted.includes(key) }),
}));

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <LogTabs />
    <Routes><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>
);

describe('LogTabs', () => {
  it('marks the open kind and moves to the other one', () => {
    granted = ['calls', 'messages'];
    renderAt('/calls');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/messages');
  });

  it('shows nothing when the role has only one kind', () => {
    granted = ['calls'];
    renderAt('/calls');
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
