import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette';

vi.mock('../AIChat/AIChat.jsx', () => ({ default: () => <div data-testid="ai-chat">chat</div> }));
vi.mock('../ApiDocs/McpWorkspace.jsx', () => ({ default: () => <div data-testid="mcp-workspace" /> }));

// ⌘K is the assistant chat and nothing else — not the MCP developer workspace.
describe('CommandPalette', () => {
  it('opens the assistant chat', async () => {
    render(<CommandPalette open onClose={vi.fn()} />);

    expect(await screen.findByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close assistant' })).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-workspace')).toBeNull();
  });
});
