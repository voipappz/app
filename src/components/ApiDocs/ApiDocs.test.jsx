import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { pretendScreenWidth } from '../../test/screenWidth.js';
import ApiDocs from './ApiDocs.jsx';

vi.mock('swagger-ui-react', () => ({
  default: ({ spec, requestInterceptor }) => {
    const request = requestInterceptor({ headers: {} });
    return (
      <div
        data-testid="swagger-ui" data-server={spec.servers[0].url} data-authorization={request.headers.Authorization}
        data-paths={Object.keys(spec.paths).join(' ')}
      />
    );
  },
}));
vi.mock('swagger-ui-react/swagger-ui.css', () => ({}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ access: 'admin-access-token' }) }));
const themeMode = vi.hoisted(() => ({ isDarkMode: false }));
vi.mock('../../context/ThemeContext', () => ({ useThemeMode: () => themeMode }));
vi.mock('../../config.js', () => ({ config: { apiBaseUrl: 'https://api.example.test' } }));

const contract = { openapi: '3.0.1', servers: [], paths: { '/api/calls': { get: {} } } };

describe('ApiDocs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    themeMode.isDarkMode = false;
    document.documentElement.classList.remove('dark-mode');
  });

  it('renders the Swagger screen without duplicating the MCP workspace', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => contract });
    render(<ApiDocs />);

    const swagger = await screen.findByTestId('swagger-ui');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/tasks/openapi.json', {
      credentials: 'omit', headers: { Accept: 'application/json' },
    });
    expect(swagger).toHaveAttribute('data-server', 'https://api.example.test');
    expect(swagger).toHaveAttribute('data-authorization', 'Bearer admin-access-token');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MCP' })).not.toBeInTheDocument();
  });

  it('mirrors dark mode for Swagger and removes the flag on unmount', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => contract });
    themeMode.isDarkMode = true;
    const { unmount } = render(<ApiDocs />);
    await screen.findByTestId('swagger-ui');
    expect(document.documentElement).toHaveClass('dark-mode');
    unmount();
    expect(document.documentElement).not.toHaveClass('dark-mode');
  });

  describe('the category menu and search', () => {
    const big = {
      openapi: '3.0.1', servers: [],
      paths: {
        '/api/calls': { get: { summary: 'List calls' } },
        '/api/providers/{id}': { get: { summary: 'Get a provider' } },
        '/api/routes': { post: { tags: ['routes'], summary: 'Create a DID' } },
      },
    };
    let restoreWidth;

    beforeEach(() => {
      restoreWidth = pretendScreenWidth(1440);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => big });
    });
    afterEach(() => restoreWidth());

    it('lists a category for every resource, untagged ones included', async () => {
      render(<ApiDocs />);
      const nav = await screen.findByRole('navigation', { name: 'API categories' });
      ['Calls', 'Providers', 'Routes'].forEach((name) => expect(within(nav).getByText(name)).toBeInTheDocument());
      expect(within(nav).queryByText('default')).not.toBeInTheDocument();
    });

    it('narrows Swagger to a clicked category', async () => {
      render(<ApiDocs />);
      const nav = await screen.findByRole('navigation', { name: 'API categories' });
      fireEvent.click(within(nav).getByText('Providers'));
      expect(screen.getByTestId('swagger-ui')).toHaveAttribute('data-paths', '/api/providers/{id}');
      expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument();
    });

    it('filters by search words, and says so when nothing matches', async () => {
      render(<ApiDocs />);
      const search = await screen.findByRole('textbox', { name: 'Search the API' });
      fireEvent.change(search, { target: { value: 'post did' } });
      await waitFor(() => expect(screen.getByTestId('swagger-ui')).toHaveAttribute('data-paths', '/api/routes'));
      fireEvent.change(search, { target: { value: 'nothing-like-this' } });
      expect(await screen.findByText(/No endpoints match “nothing-like-this”/)).toBeInTheDocument();
      expect(screen.queryByTestId('swagger-ui')).not.toBeInTheDocument();
    });
  });

  it('shows an error when the live contract cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 });
    render(<ApiDocs />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('OpenAPI document returned HTTP 503'));
  });
});
