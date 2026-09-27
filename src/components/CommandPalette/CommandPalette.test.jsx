import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette';

vi.mock('../ApiDocs/McpWorkspace.jsx', () => ({
  default: ({ initialQuestion }) => <div data-testid="mcp-workspace">workspace:{initialQuestion}</div>,
}));

// ⌘K is the MCP workspace and nothing else for now: no resource search, no
// quick actions.
describe('CommandPalette', () => {
  it('opens the MCP workspace, seeded with the typed question', async () => {
    render(<CommandPalette open onClose={vi.fn()} initialQuery="how many calls today" />);

    expect(await screen.findByTestId('mcp-workspace')).toHaveTextContent('workspace:how many calls today');
    expect(screen.getByRole('button', { name: 'Close MCP' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search, ask, or call/)).toBeNull();
  });
});
