import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import CallToast from './CallToast.jsx';

afterEach(() => i18n.changeLanguage('en'));

describe('the incoming call toast', () => {
  it('keeps the English buttons', () => {
    render(<CallToast open title="Incoming call" number="+972501234567" onAnswer={() => {}} onReject={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('speaks Hebrew and keeps the number left to right', async () => {
    await i18n.changeLanguage('he');
    render(<CallToast open title="שיחה נכנסת" number="+972501234567" onAnswer={() => {}} onReject={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'מענה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'דחייה' })).toBeInTheDocument();
    expect(screen.getByText('+972501234567').tagName).toBe('BDI');
  });
});
