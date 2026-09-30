import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog.jsx';
import { ConfirmProvider, useConfirm } from './useConfirm.jsx';
import { Z } from '../../utils/zIndex.js';

describe('ConfirmDialog', () => {
  it('names what is being deleted and is labelled for screen readers', () => {
    render(<ConfirmDialog open title="Delete User" entityName="Dana" onClose={() => {}} onConfirm={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Delete User' });
    expect(dialog).toHaveTextContent('Are you sure you want to delete Dana?');
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/);
  });

  // A confirmation asked from inside a layered dialog (the VML editor's
  // "replace content?") opened underneath it, where it could not be answered.
  it('stacks above every dialog layer', () => {
    render(<ConfirmDialog open title="Replace" onClose={() => {}} onConfirm={() => {}} />);
    const root = screen.getByRole('dialog').closest('.MuiModal-root');
    expect(Number(getComputedStyle(root).zIndex)).toBeGreaterThan(Z.L3.MENU);
  });

  it('confirms with the button and with Enter, cancels with Esc', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open title="Delete" onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('confirm-delete-button'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // Found in review: keydown bubbles, so "Enter anywhere but a textarea"
  // meant Enter on the focused Cancel button deleted the record.
  it('does not confirm when Enter comes from Cancel or another control', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Delete" onClose={() => {}} onConfirm={onConfirm}>
        <input aria-label="reason" />
      </ConfirmDialog>
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Enter', bubbles: true });
    fireEvent.keyDown(screen.getByLabelText('reason'), { key: 'Enter', bubbles: true });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('locks while loading: no confirm, no cancel', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open loading title="Delete" onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByTestId('confirm-delete-button')).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is not red when not destructive', () => {
    render(<ConfirmDialog open destructive={false} confirmLabel="Send" title="Send" onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByTestId('confirm-delete-button')).toHaveClass('MuiButton-colorPrimary');
  });
});

describe('useConfirm', () => {
  const Probe = ({ onResult }) => {
    const confirm = useConfirm();
    return <button onClick={async () => onResult(await confirm({ title: 'Remove it?' }))}>go</button>;
  };

  it('resolves true on confirm and false on cancel', async () => {
    const results = [];
    render(<ConfirmProvider><Probe onResult={(r) => results.push(r)} /></ConfirmProvider>);

    fireEvent.click(screen.getByText('go'));
    fireEvent.click(await screen.findByTestId('confirm-delete-button'));
    await vi.waitFor(() => expect(results).toEqual([true]));

    fireEvent.click(screen.getByText('go'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(results).toEqual([true, false]));
  });

  it('answers a superseded confirm with false instead of stranding it', async () => {
    const results = [];
    const Two = () => {
      const confirm = useConfirm();
      return <button onClick={() => { confirm({ title: 'first' }).then((r) => results.push(['first', r]));
                                      confirm({ title: 'second' }).then((r) => results.push(['second', r])); }}>go</button>;
    };
    render(<ConfirmProvider><Two /></ConfirmProvider>);
    fireEvent.click(screen.getByText('go'));
    await vi.waitFor(() => expect(results).toEqual([['first', false]]));

    fireEvent.click(await screen.findByTestId('confirm-delete-button'));
    await vi.waitFor(() => expect(results).toEqual([['first', false], ['second', true]]));
  });

  it('answers false when the provider unmounts with a dialog open', async () => {
    const results = [];
    const { unmount } = render(<ConfirmProvider><Probe onResult={(r) => results.push(r)} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('go'));
    await screen.findByRole('dialog');
    unmount();
    await vi.waitFor(() => expect(results).toEqual([false]));
  });

  it('keeps the consequence line in the window.confirm fallback', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const Fallback = () => {
      const confirm = useConfirm();
      return <button onClick={() => confirm({ title: 'Delete all', message: 'Delete all 9 notifications?' })}>go</button>;
    };
    render(<Fallback />);
    fireEvent.click(screen.getByText('go'));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith('Delete all 9 notifications?\n\nThis action cannot be undone.'));
    spy.mockRestore();
  });

  it('falls back to window.confirm without a provider', async () => {
    const results = [];
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Probe onResult={(r) => results.push(r)} />);
    fireEvent.click(screen.getByText('go'));
    await vi.waitFor(() => expect(results).toEqual([true]));
    expect(spy).toHaveBeenCalledWith('Remove it?\n\nThis action cannot be undone.');
    spy.mockRestore();
  });
});
