import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import WidgetEditor from './WidgetEditor';
import { deriveFieldOptions } from './widgetFields';

// i18n is exercised elsewhere; here the fallback copy keeps assertions readable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key, fallback) => fallback ?? _key }),
}));

const SNAPSHOT = {
  stats: { total: 5, answered: 4, failed: 1, inbound: 3, outbound: 2, avg_duration_sec: 30 },
  calls_per_hour: [{ bucket: '2026-08-04 10:00:00', inbound: 3, outbound: 2, total: 5 }],
  recent_calls: [{ id: 'c1', started_at: 'x', direction: 'inbound', from_number: '1', to_number: '2', status: 'answered', duration_sec: 9 }],
};

function open(widget = null) {
  const onSave = vi.fn();
  render(
    <WidgetEditor
      open widget={widget} options={deriveFieldOptions(SNAPSHOT)}
      onClose={() => {}} onSave={onSave}
    />,
  );
  return onSave;
}

describe('WidgetEditor', () => {
  it('lists the snapshot stats as the metric choices for a counter', () => {
    open();
    const fields = within(screen.getByTestId('widget-field-select'));
    for (const stat of Object.keys(SNAPSHOT.stats)) {
      expect(fields.getByRole('radio', { name: stat })).toBeTruthy();
    }
    // and nothing from nimbus's identity schema
    expect(screen.queryByText(/agents\.|queue\./)).toBeNull();
  });

  it('saves the field picked in the field select as the widget metric', () => {
    const onSave = open();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Missed' } });
    fireEvent.click(within(screen.getByTestId('widget-field-select')).getByRole('radio', { name: 'failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Missed', type: 'counter', metric: 'failed', fields: ['failed'],
    }));
  });

  it('applies a template chip to the whole draft', () => {
    const onSave = open();
    fireEvent.click(screen.getByRole('button', { name: 'Recent calls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Recent calls', type: 'table',
      fields: ['started_at', 'direction', 'from_number', 'to_number', 'status', 'duration_sec'],
    }));
  });

  it('switches the field select to multi-select for a table widget', () => {
    open({ uuid: 'w1', title: 'Calls', type: 'table', fields: ['status'] });
    const fields = within(screen.getByTestId('widget-field-select'));
    expect(fields.getByRole('checkbox', { name: 'status' }).checked).toBe(true);
    expect(fields.getByRole('checkbox', { name: 'from_number' }).checked).toBe(false);
    expect(fields.queryByRole('radio')).toBeNull();
  });

  it('has no Redis tab — only General / Appearance / Thresholds', () => {
    open();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent))
      .toEqual(['General', 'Appearance', 'Thresholds']);
  });

  it('refuses to save an untitled widget', () => {
    open();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
  });
});
