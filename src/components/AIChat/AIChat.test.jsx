import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const chatViewProps = [];
vi.mock('@voipappz/chat-ui', () => ({
  ChatView: (props) => { chatViewProps.push(props); return null; },
}));
vi.mock('./useAIChat', () => ({
  NO_LLM_MESSAGE: 'no llm',
  useAIChat: () => ({
    messages: [], inputValue: '', sessions: [], llmMissing: false,
    fetchAgents: vi.fn(), sendMessage: vi.fn(), setInputValue: vi.fn(),
  }),
}));
vi.mock('../../context/AIChatSidebarContext', () => ({
  useAIChatSidebar: () => ({ aiSidebarOpen: true, toggleAISidebar: vi.fn() }),
}));
vi.mock('../../services/api/providersApi', () => ({ providersApi: { getServices: vi.fn(() => Promise.resolve([])) } }));
vi.mock('../Providers/ProviderDialog/ProviderDialog', () => ({ default: () => null }));

import AIChat from './AIChat';

describe('AIChat session list', () => {
  beforeEach(() => { chatViewProps.length = 0; });

  it('follows the app-wide setting in the full assistant', () => {
    render(<AIChat />);
    expect(chatViewProps.at(-1).sidebarCollapsed).toBe(false);
  });

  // The bot editor's column is 400px; an open 256px list clipped the chat.
  it('starts closed in a compact panel', () => {
    render(<AIChat compact />);
    expect(chatViewProps.at(-1).sidebarCollapsed).toBe(true);
  });
});
