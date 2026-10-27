import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WizardViewRenderer from './WizardViewRenderer.jsx';
import { refreshRoutingChains } from '../DIDDialog/RoutingChain';

// A stand-in editor: its name, and Save / Cancel the way every real one ends.
const { editor } = vi.hoisted(() => ({
  editor: (name) => function FakeEditor({ onSave, onClose }) {
    return <>
      <p>{name}</p>
      <button onClick={() => { onSave({ uuid: `${name}-1` }); onClose(); }}>{`Save ${name}`}</button>
      <button onClick={onClose}>{`Cancel ${name}`}</button>
    </>;
  },
}));

vi.mock('../DIDDialog/RoutingChain', () => ({ refreshRoutingChains: vi.fn() }));
vi.mock('../DIDDialog/DIDForm', () => ({ default: () => null }));
vi.mock('../../Bridges/IVRBridge/IVRBridge', () => ({ IVRBridge: editor('Admin IVR form') }));
vi.mock('../../Bridges/IvrMenu/IvrMenuEditor', () => ({ default: editor('Phone menu editor') }));
let userSession = false;
vi.mock('../../../hooks/useIsUserSession', () => ({ useIsUserSession: () => userSession }));
vi.mock('../../Bridges/QueueBridge/QueueBridge', () => ({ QueueBridge: editor('queue') }));
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
vi.mock('../../Bridges/BotBridge/BotBridge.jsx', () => ({ BotBridge: editor('bot') }));
vi.mock('../../Bridges/ExtensionBridge/ExtensionBridge.jsx', () => ({ ExtensionBridge: editor('device') }));
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

describe('the IVR step', () => {
  afterEach(() => { userSession = false; });

  it('gives a portal user the phone-menu editor', () => {
    userSession = true;
    render(<WizardViewRenderer view={{ type: 'ivr', mode: 'create' }} onCancel={vi.fn()} />);
    expect(screen.getByText('Phone menu editor')).toBeInTheDocument();
  });

  it('keeps the full IVR form for an account', () => {
    render(<WizardViewRenderer view={{ type: 'ivr', mode: 'create' }} onCancel={vi.fn()} />);
    expect(screen.getByText('Admin IVR form')).toBeInTheDocument();
  });
});

// The route form and details behind the wizard show the destination's routing
// chain; saving any destination must make it load the saved version.
describe('saving a destination reloads the routing chains behind it', () => {
  beforeEach(() => { vi.mocked(refreshRoutingChains).mockClear(); });
  afterEach(() => { userSession = false; });

  it.each([
    ['queue', 'Save queue', false],
    ['ivr', 'Save Admin IVR form', false],
    ['ivr', 'Save Phone menu editor', true],
    ['announcement', 'Create announcement', false],
    ['vml', 'Update VML', false],
    ['call_condition', 'Save condition', false],
    ['bot', 'Save bot', false],
    ['extension', 'Save device', false],
  ])('%s: %s', (type, saveButton, asUser) => {
    userSession = asUser;
    render(<WizardViewRenderer view={{ type, mode: 'edit' }} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: saveButton }));
    expect(refreshRoutingChains).toHaveBeenCalledTimes(1);
  });

  it('does not reload when an editor is cancelled', () => {
    render(<WizardViewRenderer view={{ type: 'queue', mode: 'edit' }} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel queue' }));
    expect(refreshRoutingChains).not.toHaveBeenCalled();
  });
});
