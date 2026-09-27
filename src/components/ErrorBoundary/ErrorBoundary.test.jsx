import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary, { describeError } from './ErrorBoundary';

const chunk = new TypeError('Failed to fetch dynamically imported module: https://switch.voipappz.io/assets/Calls-L4KEZ7ss.js');

describe('describeError', () => {
  it('names a failed screen download as a network/deploy problem, per browser wording', () => {
    expect(describeError(chunk, true)).toMatchObject({ kind: 'network', title: "Couldn't load this screen", detail: 'Missing file: Calls-L4KEZ7ss.js' });
    expect(describeError(new TypeError('Importing a module script failed.'), true).kind).toBe('network');
    expect(describeError(chunk, false).body).toMatch(/offline/);
  });

  it('keeps other errors as app errors', () => {
    expect(describeError(new Error('x is undefined')).kind).toBe('app');
  });
});

describe('ErrorBoundary', () => {
  it('shows the network explanation and a reload action for a failed download', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => { throw chunk; };
    render(<ErrorBoundary><Boom /></ErrorBoundary>);

    expect(screen.getByText("Couldn't load this screen")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
  });
});
