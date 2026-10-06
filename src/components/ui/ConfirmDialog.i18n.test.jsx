import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import ConfirmDialog from './ConfirmDialog';

afterEach(() => i18n.changeLanguage('en'));

describe('ConfirmDialog in Hebrew', () => {
  it('uses Hebrew defaults and keeps the name in bold', async () => {
    await i18n.changeLanguage('he');
    render(<ConfirmDialog open entityName="Sales queue" onClose={() => {}} onConfirm={() => {}} />);

    expect(screen.getByText('Sales queue').tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: 'מחיקה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeInTheDocument();
  });

  it("keeps a screen's own wording", async () => {
    await i18n.changeLanguage('he');
    render(<ConfirmDialog open title="Delete User" confirmLabel="Remove" onClose={() => {}} onConfirm={() => {}} />);

    expect(screen.getByText('Delete User')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });
});
