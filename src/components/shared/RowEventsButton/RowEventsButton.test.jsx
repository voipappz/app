import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RowEventsButton from './RowEventsButton.jsx';

let logs = true;
vi.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: (key) => key === 'logs' && logs }) }));

describe('the Events button on a list row', () => {
  let opened;
  const onOpen = (e) => opened.push(e.detail);
  beforeEach(() => { opened = []; logs = true; window.addEventListener('openEventsModal', onOpen); });
  afterEach(() => window.removeEventListener('openEventsModal', onOpen));

  it("opens the Events window on that record's events", () => {
    render(<RowEventsButton subject="did" uuid="d-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(opened).toEqual(['subject=did&subject_uuid=d-1']);
  });

  it('opens on what an account did when given an actor', () => {
    render(<RowEventsButton actor="ops@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(opened).toEqual(['actor=ops%40example.com']);
  });

  it('follows the ACL: hidden without logs access', () => {
    logs = false;
    render(<RowEventsButton subject="did" uuid="d-1" />);
    expect(screen.queryByRole('button', { name: 'Events' })).toBeNull();
  });
});
