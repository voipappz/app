import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import McpAssistant from './McpAssistant.jsx';
import { askMcpAssistant, listMcpTools } from '../../services/mcpAssistant';

vi.mock('../../services/mcpAssistant', async (importOriginal) => ({
  ...(await importOriginal()),
  askMcpAssistant: vi.fn(),
  listMcpTools: vi.fn(),
}));
vi.mock('../../services/apiService', () => ({ apiService: { getToken: () => 'tok-1' } }));

beforeEach(() => {
  vi.clearAllMocks();
  listMcpTools.mockResolvedValue([{ name: 'calls.summary' }]);
  askMcpAssistant.mockResolvedValue({ text: 'You had 12 calls today.' });
});

describe('McpAssistant', () => {
  it('keeps the conversation and answers from the session’s own tools', async () => {
    const user = userEvent.setup();
    render(<McpAssistant />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Ask the assistant' }), 'how many calls today{Enter}');

    expect(askMcpAssistant).toHaveBeenCalledWith('tok-1', 'how many calls today');
    expect(await screen.findByRole('status')).toHaveTextContent('You had 12 calls today.');
    expect(screen.getByText('how many calls today')).toBeInTheDocument();
  });

  it('offers the portal’s suggested questions as one click', async () => {
    const user = userEvent.setup();
    askMcpAssistant.mockResolvedValue({ text: 'No abandoned calls.', details: { cdrs: [] } });
    render(<McpAssistant />);

    await user.click(await screen.findByText('Do I have abandoned calls?'));

    expect(askMcpAssistant).toHaveBeenCalledWith('tok-1', 'Do I have abandoned calls?');
    expect(await screen.findByText('View details')).toBeInTheDocument();
  });

  it('says when the tools cannot be reached and offers a retry', async () => {
    listMcpTools.mockRejectedValueOnce(new Error('The MCP server did not accept this request.'));
    render(<McpAssistant />);

    expect(await screen.findByText('Disconnected')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  });
});
