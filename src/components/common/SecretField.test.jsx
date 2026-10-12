import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// SecretField reads CSS.supports once, at import; each case imports it fresh.
const load = async (canMask) => {
  vi.resetModules();
  vi.stubGlobal('CSS', { supports: () => canMask });
  return (await import('./SecretField.jsx')).default;
};

afterEach(() => vi.unstubAllGlobals());

describe('SecretField', () => {
  it('is a masked TEXT input, which browsers do not offer to save', async () => {
    const SecretField = await load(true);
    render(<SecretField label="SIP Password" value="s3cret" onChange={() => {}} />);
    const input = screen.getByLabelText('SIP Password');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('data-1p-ignore', 'true');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    // jsdom 30 drops the inline -webkit-text-security it does not know, so the
    // masking is checked through the attribute the component sets with it.
    expect(input).toHaveAttribute('data-secret-field', 'masked');
  });

  it('shows the value when revealed', async () => {
    const SecretField = await load(true);
    render(<SecretField label="Password" value="s3cret" revealed onChange={() => {}} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('data-secret-field', 'revealed');
    expect(input.getAttribute('style') || '').not.toMatch(/disc/);
  });

  it('falls back to a real password input where text cannot be masked', async () => {
    const SecretField = await load(false);
    render(<SecretField label="API Key" value="sk-1" onChange={() => {}} />);
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
  });

  it('keeps the caller\'s inputProps', async () => {
    const SecretField = await load(true);
    render(<SecretField label="Password" value="" onChange={() => {}} inputProps={{ 'data-testid': 'pw' }} />);
    expect(screen.getByTestId('pw')).toHaveAttribute('autocomplete', 'off');
  });
});
