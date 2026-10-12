import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WizardViewRenderer from './WizardViewRenderer.jsx';

vi.mock('../DIDDialog/DIDForm', () => ({ default: () => null }));
vi.mock('../../Bridges/IVRBridge/IVRBridge', () => ({ IVRBridge: () => null }));
vi.mock('../../Bridges/QueueBridge/QueueBridge', () => ({ QueueBridge: () => null }));
vi.mock('../../Bridges/AnnouncementBridge/AnnouncementBridge.jsx', () => ({
  AnnouncementBridge: ({ onSave, onClose }) => <>
    <button onClick={() => { onSave({ uuid: 'ann-1' }); onClose(); }}>Create announcement</button>
  </>,
}));
vi.mock('../../Bridges/CallConditionBridge/CallConditionBridge.jsx', () => ({
  CallConditionBridge: ({ onSave, onClose }) => <>
    <button onClick={() => { onSave({ uuid: 'cc-1' }); onClose(); }}>Save condition</button>
    <button onClick={onClose}>Cancel condition</button>
  </>,
}));
vi.mock('../../Bridges/BotBridge/BotBridge.jsx', () => ({ BotBridge: () => null }));
vi.mock('../../Bridges/ExtensionBridge/ExtensionBridge.jsx', () => ({ ExtensionBridge: () => null }));
vi.mock('../../Bridges/VMLBridge/VMLBridge.jsx', () => ({
  VMLBridge: ({ onSave, onClose }) => <>
    <button onClick={() => { onSave({ uuid: 'vml-1' }); onClose(); }}>Update VML</button>
    <button onClick={onClose}>Cancel</button>
  </>,
}));

describe('VML navigation within the route wizard', () => {
  it('returns the saved VML once, without also popping the route draft', () => {
    const onCancel = vi.fn();
    render(<WizardViewRenderer view={{ type: 'vml', mode: 'edit' }} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update VML' }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith({ uuid: 'vml-1' });
  });

  it('goes back without a result when editing is cancelled', () => {
    const onCancel = vi.fn();
    render(<WizardViewRenderer view={{ type: 'vml', mode: 'edit' }} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe('call condition navigation within the route wizard', () => {
  it('returns the saved condition once, without also popping the route draft', () => {
    const onCancel = vi.fn();
    render(<WizardViewRenderer view={{ type: 'call_condition', mode: 'edit' }} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save condition' }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith({ uuid: 'cc-1' });
  });

  it('goes back without a result when editing is cancelled', () => {
    const onCancel = vi.fn();
    render(<WizardViewRenderer view={{ type: 'call_condition', mode: 'edit' }} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel condition' }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe('an announcement made on the way', () => {
  it('goes back one view only, to the editor that asked for it', () => {
    const onCancel = vi.fn();
    render(<WizardViewRenderer view={{ type: 'announcement', mode: 'create' }} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create announcement' }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith({ uuid: 'ann-1' });
  });
});
