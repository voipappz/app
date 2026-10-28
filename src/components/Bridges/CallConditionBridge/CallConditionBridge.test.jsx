import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from '../../../i18n';
import { CallConditionBridge } from './CallConditionBridge';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { createCallCondition, getCallCondition, updateCallCondition } from '../../../services/api/callConditionsApi';
import { createSegment, deleteSegment } from '../../../services/api/segmentsApi';

vi.mock('../../../services/api/bridgeApi', () => ({
  bridgeApi: { getBridgeTypes: vi.fn(), getBridgeResources: vi.fn() },
}));
vi.mock('../../../services/api/callConditionsApi', () => ({
  createCallCondition: vi.fn(), getCallCondition: vi.fn(), updateCallCondition: vi.fn(),
}));
vi.mock('../../../services/api/segmentsApi', () => ({ createSegment: vi.fn(), deleteSegment: vi.fn() }));
vi.mock('../../../context/CustomerEnvironmentContext', () => ({
  useCustomerEnvironment: () => ({ selectedEnvironments: [{ uuid: 'env-1', name: 'Sales' }] }),
}));
let userSession = false;
vi.mock('../../../hooks/useIsUserSession', () => ({ useIsUserSession: () => userSession }));

const LISTS = {
  queue: [{ uuid: 'q-1', name: 'Support' }],
  vml: [{ uuid: 'v-1', name: 'Voicemail' }],
};

beforeEach(() => {
  userSession = false;
  bridgeApi.getBridgeTypes.mockResolvedValue(['queue', 'vml', 'bot', 'user_login']);
  bridgeApi.getBridgeResources.mockImplementation(async (type) => LISTS[type] || []);
  createSegment.mockImplementation(async (segment) => ({ uuid: `seg-${segment.field}` }));
  deleteSegment.mockResolvedValue({});
  createCallCondition.mockResolvedValue({ uuid: 'cc-1' });
  updateCallCondition.mockResolvedValue({ uuid: 'cc-1' });
});
afterEach(() => { vi.clearAllMocks(); return i18n.changeLanguage('en'); });

const pick = async (comboboxName, optionName) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: comboboxName }));
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
};

// Opens a "where calls go" row and chooses a destination in it.
const chooseDestination = async (rowTestId, type, name) => {
  fireEvent.click(screen.getByTestId(rowTestId));
  const dialog = await screen.findByRole('dialog');
  await pick('Type', type);
  await pick('Destination', name);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};

const renderPage = (props = {}) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<CallConditionBridge open containerMode="panel" onSave={onSave} onClose={onClose} {...props} />);
  return { onSave, onClose };
};

describe('creating a call condition', () => {
  // The whole form in one go, and the file's first test (it loads MUI): near
  // the 15s default on a busy machine, so it gets 30s.
  it('builds business hours and saves them as one rule plus the fallback', async () => {
    const { onSave, onClose } = renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'office hours' } });
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('office_hours');

    fireEvent.click(screen.getByRole('switch', { name: 'Open on Sun' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Sun to all days' }));
    expect(screen.getByTestId('week-summary')).toHaveTextContent('Sun–Sat 09:00–17:00');

    await chooseDestination('target-while-open', 'Queue', 'Support');
    await chooseDestination('target-otherwise', 'VML script', 'Voicemail');
    expect(screen.getByTestId('target-while-open')).toHaveTextContent('Queue · Support');

    getCallCondition.mockResolvedValue({ uuid: 'cc-1', name: 'office_hours' });
    fireEvent.click(screen.getByTestId('call-condition-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ uuid: 'cc-1', name: 'office_hours' }));
    expect(onClose).toHaveBeenCalled();
    // Every day 09-17: just the hours, sent as 9..16.
    expect(createSegment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ field: 'time.hour', operator: 'BETWEEN', value: ['9', '16'] }));
    expect(createCallCondition).toHaveBeenCalledWith(expect.objectContaining({
      name: 'office_hours',
      enabled: true,
      environment_uuid: 'env-1',
      fallback_bridge_type: 'vml',
      fallback_bridge_uuid: 'v-1',
      resources: [{ name: 'open_1', bridge_type: 'queue', bridge_uuid: 'q-1', segment_uuids: ['seg-time.hour'] }],
    }));
  }, 30000);

  it('deletes the segments it just created when the save fails', async () => {
    const { onSave } = renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'office hours' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Open on Sun' }));
    await chooseDestination('target-while-open', 'Queue', 'Support');
    await chooseDestination('target-otherwise', 'VML script', 'Voicemail');

    createCallCondition.mockRejectedValue(new Error('Internal server error'));
    fireEvent.click(screen.getByTestId('call-condition-save'));

    await waitFor(() => expect(deleteSegment).toHaveBeenCalledWith('seg-time.hour'));
    expect(onSave).not.toHaveBeenCalled();
  }, 30000);

  it('says what is missing instead of saving', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('call-condition-save'));
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    expect(screen.getByText('Fill in the highlighted fields first.')).toBeInTheDocument();
    expect(createCallCondition).not.toHaveBeenCalled();
    expect(createSegment).not.toHaveBeenCalled();
  });

  // The reason a Save stopped must be in view: the page goes to the first
  // problem and puts the cursor in it.
  it('takes you to the first missing field when Create stops', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('call-condition-save'));
    const name = screen.getByRole('textbox', { name: /^Name/ });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute('aria-invalid', 'true');
  });

  it('says a name it cannot take is wrong while it is typed', () => {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'sales!' } });
    expect(screen.getByText('Use letters, numbers, - or _')).toBeInTheDocument();
  });

  it('saves a Hebrew name, spaces turned into _', async () => {
    renderPage();
    const name = screen.getByRole('textbox', { name: /^Name/ });
    fireEvent.change(name, { target: { value: 'שעות פעילות' } });
    expect(name).toHaveValue('שעות_פעילות');
    expect(name).not.toHaveAttribute('aria-invalid', 'true');
    // No open days: only "otherwise" needs a destination.
    await chooseDestination('target-otherwise', 'VML script', 'Voicemail');
    fireEvent.click(screen.getByTestId('call-condition-save'));
    await waitFor(() => expect(createCallCondition).toHaveBeenCalledWith(expect.objectContaining({ name: 'שעות_פעילות' })));
  });

  it('offers no application to a user, and still sends their own', async () => {
    userSession = true;
    const { onSave } = renderPage();
    expect(screen.queryByRole('combobox', { name: 'Application' })).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'night' } });
    await chooseDestination('target-otherwise', 'VML script', 'Voicemail');
    getCallCondition.mockResolvedValue({ uuid: 'cc-1' });
    fireEvent.click(screen.getByTestId('call-condition-save'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(createCallCondition).toHaveBeenCalledWith(expect.objectContaining({ name: 'night', environment_uuid: 'env-1' }));
  });

  it('has no Enabled switch', () => {
    renderPage();
    expect(screen.queryByLabelText(/Enabled/)).toBeNull();
  });
});

describe('editing a call condition', () => {
  const saved = {
    uuid: 'cc-1', name: 'office_hours', notes: '', fallback_bridge_type: 'vml', fallback_bridge_uuid: 'v-1',
    environment: { uuid: 'env-1' },
    resources: [
      { bridge_type: 'que', bridge_uuid: 'q-1', segments: [
        { uuid: 's-days', field: 'time.weekday', operator: 'IN', val: ['1', '2'] },
        { uuid: 's-hours', field: 'time.hour', operator: 'BETWEEN', val: ['8', '16'] },
      ] },
    ],
  };

  it('shows the saved week and sends unchanged rules back by their segments', async () => {
    getCallCondition.mockResolvedValue(saved);
    const { onSave } = renderPage({ mode: 'edit', callCondition: { uuid: 'cc-1' } });

    expect(await screen.findByTestId('week-summary')).toHaveTextContent('Sun Closed · Mon–Tue 08:00–17:00 · Wed–Sat Closed');
    await waitFor(() => expect(screen.getByTestId('target-while-open')).toHaveTextContent('Queue · Support'));

    fireEvent.click(screen.getByTestId('call-condition-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(createSegment).not.toHaveBeenCalled();
    expect(updateCallCondition).toHaveBeenCalledWith('cc-1', expect.objectContaining({
      resources: [{ name: 'open_1', bridge_type: 'queue', bridge_uuid: 'q-1', segment_uuids: ['s-days', 's-hours'] }],
    }));
  });

  it('creates only the segment that changed', async () => {
    getCallCondition.mockResolvedValue(saved);
    renderPage({ mode: 'edit', callCondition: { uuid: 'cc-1' } });
    await screen.findByTestId('week-summary');

    // Wednesday joins Monday and Tuesday: new days, same hours.
    fireEvent.click(screen.getByRole('switch', { name: 'Open on Wed' }));
    fireEvent.mouseDown(within(screen.getByTestId('day-row-3')).getByRole('combobox', { name: 'From' }));
    fireEvent.click(await screen.findByRole('option', { name: '08:00' }));
    fireEvent.mouseDown(within(screen.getByTestId('day-row-3')).getByRole('combobox', { name: 'To' }));
    fireEvent.click(await screen.findByRole('option', { name: '17:00' }));

    fireEvent.click(screen.getByTestId('call-condition-save'));
    await waitFor(() => expect(updateCallCondition).toHaveBeenCalled());
    expect(createSegment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ field: 'time.weekday', value: ['1', '2', '3'] }));
    expect(updateCallCondition.mock.calls[0][1].resources[0].segment_uuids).toEqual(['seg-time.weekday', 's-hours']);
  });
});

describe('in Hebrew', () => {
  it('names the sections and days in Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderPage();
    expect(screen.getByText('שעות פעילות')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'פתוח ביום א׳' })).toBeInTheDocument();
  });
});
