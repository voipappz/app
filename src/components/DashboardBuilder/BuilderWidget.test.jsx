import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import BuilderWidget from './BuilderWidget';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key, fallback) => fallback ?? _key }),
}));

const SNAPSHOT = {
  stats: { total: 8, answered: 6 },
  calls_per_hour: [
    { bucket: '10:00', inbound: 2, outbound: 1 },
    { bucket: '11:00', inbound: 3, outbound: 2 },
  ],
  recent_calls: [{ id: 'c1', started_at: '10:00', direction: 'inbound', status: 'answered' }],
};

const renderWidget = (type, callbacks = {}) => render(
  <BuilderWidget
    widget={{ uuid: `widget-${type}`, title: `${type} widget`, type, metric: 'answered' }}
    snapshot={SNAPSHOT}
    onEdit={callbacks.onEdit || vi.fn()}
    onDuplicate={callbacks.onDuplicate || vi.fn()}
    onDelete={callbacks.onDelete || vi.fn()}
  />,
);

describe('BuilderWidget', () => {
  it.each(['counter', 'gauge', 'stat'])('renders the %s value preview', (type) => {
    renderWidget(type);
    const preview = screen.getByTestId(`widget-preview-${type}`);
    expect(within(preview).getByText('6')).toBeInTheDocument();
  });

  it.each(['line', 'bar', 'pie'])('renders the %s data preview', (type) => {
    renderWidget(type);
    expect(screen.getByTestId(`widget-preview-${type}`).children).not.toHaveLength(0);
    expect(screen.queryByText('No call data yet')).not.toBeInTheDocument();
  });

  it('keeps secondary actions in one menu and invokes the selected action', () => {
    const onEdit = vi.fn();
    renderWidget('counter', { onEdit });

    fireEvent.click(screen.getByRole('button', { name: 'Widget actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit widget' }));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'widget-counter' }));
  });
});
