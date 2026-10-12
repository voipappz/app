import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DIDWizard from './DIDWizard.jsx';
import { pretendPhoneScreen } from '../../../test/phoneScreen';

vi.mock('./WizardViewRenderer', () => ({ default: () => <div>route form</div> }));

const wizardState = {
  viewStack: [{ id: 'v1', type: 'did', mode: 'create', label: 'Route: (new)' }],
  currentView: { id: 'v1', type: 'did', mode: 'create' },
  isOpen: true,
  canGoBack: false,
  close: vi.fn(),
  pushView: vi.fn(),
  popView: vi.fn(),
  navigateTo: vi.fn(),
};
const paper = () => screen.getByText('route form').closest('.MuiDialog-paper');

let backToDesktop = () => {};
afterEach(() => { backToDesktop(); backToDesktop = () => {}; });

describe('the route form', () => {
  it('is a centred panel on a desktop', () => {
    render(<DIDWizard wizardState={wizardState} onClose={() => {}} />);
    expect(paper()).not.toHaveClass('MuiDialog-paperFullScreen');
    expect(screen.getByText(/Set up a new phone number/)).toBeInTheDocument();
  });

  it('fills the screen on a phone, without the long help text', () => {
    backToDesktop = pretendPhoneScreen();
    render(<DIDWizard wizardState={wizardState} onClose={() => {}} />);
    expect(paper()).toHaveClass('MuiDialog-paperFullScreen');
    expect(screen.getByText('Create a new Route')).toBeInTheDocument();
    expect(screen.queryByText(/Set up a new phone number/)).not.toBeInTheDocument();
  });
});

describe('the trail of steps on a phone', () => {
  const deeper = {
    ...wizardState,
    viewStack: [
      { id: 'v1', type: 'did', mode: 'edit', label: 'DID: Main line' },
      { id: 'v2', type: 'ivr', mode: 'edit', label: 'IVR: main-menu' },
      { id: 'v3', type: 'queue', mode: 'edit', label: 'Queue: support' },
    ],
    currentView: { id: 'v3', type: 'queue', mode: 'edit' },
    canGoBack: true,
    navigateTo: vi.fn(),
  };

  it('shows the step before and the current one, the rest behind ⋯', () => {
    backToDesktop = pretendPhoneScreen();
    render(<DIDWizard wizardState={deeper} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'IVR: main-menu' })).toBeInTheDocument();
    expect(screen.getByText('Queue: support').closest('[aria-current="page"]')).not.toBeNull();
    expect(screen.queryByText('DID: Main line')).not.toBeInTheDocument();
    expect(screen.queryByText(/Step \d of/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Earlier steps' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'DID: Main line' }));
    expect(deeper.navigateTo).toHaveBeenCalledWith(0);
  });

  it('goes back to the step before', () => {
    backToDesktop = pretendPhoneScreen();
    render(<DIDWizard wizardState={deeper} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'IVR: main-menu' }));
    expect(deeper.navigateTo).toHaveBeenCalledWith(1);
  });

  it('has no ⋯ with only two steps', () => {
    backToDesktop = pretendPhoneScreen();
    render(<DIDWizard wizardState={{ ...deeper, viewStack: deeper.viewStack.slice(1) }} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'IVR: main-menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Earlier steps' })).not.toBeInTheDocument();
  });

  it('keeps every pill on a desktop', () => {
    render(<DIDWizard wizardState={deeper} onClose={() => {}} />);
    expect(screen.getByText('DID: Main line')).toBeInTheDocument();
    expect(screen.queryByText('Step 3 of 3')).not.toBeInTheDocument();
  });
});
