import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WizardViewRenderer from './WizardViewRenderer.jsx';

vi.mock('../DIDDialog/DIDForm', () => ({ default: () => null }));
vi.mock('../../Bridges/IVRBridge/IVRBridge', () => ({ IVRBridge: () => null }));
vi.mock('../../Bridges/QueueBridge/QueueBridge', () => ({ QueueBridge: () => null }));
vi.mock('../../Bridges/AnnouncementBridge/AnnouncementBridge.jsx', () => ({ AnnouncementBridge: () => null }));
vi.mock('../../Bridges/CallConditionBridge/CallConditionBridge.jsx', () => ({ CallConditionBridge: () => null }));
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
