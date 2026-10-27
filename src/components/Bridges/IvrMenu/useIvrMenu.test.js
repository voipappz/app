import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBridgeResources, useDestinationChoices, useIvrMenu } from './useIvrMenu';
import { ivrApi } from '../../../services/api/ivrApi';
import { bridgeApi } from '../../../services/api/bridgeApi';

vi.mock('../../../services/api/ivrApi', () => ({
  ivrApi: { getIVR: vi.fn(), createIVR: vi.fn(), updateIVR: vi.fn() },
}));
vi.mock('../../../services/api/bridgeApi', () => ({ bridgeApi: { getBridgeResources: vi.fn(), getBridgeTypes: vi.fn() } }));
vi.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ canWriteDestinations: false }) }));

const saved = {
  uuid: 'ivr-1', name: 'Main menu', environment_uuid: 'env-9', announcement_uuid: 'ann-1',
  timeout: 5, timeout_bridge_type: 'vml', timeout_bridge_uuid: 'vml-1',
  invalid: 3, invalid_bridge_type: 'extension', invalid_bridge_uuid: 'ext-200',
  entries: { 1: { name: 'Sales', bridge_type: 'queue', bridge_uuid: 'q-1' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  ivrApi.getIVR.mockResolvedValue({ data: saved });
  ivrApi.createIVR.mockResolvedValue({ data: { uuid: 'ivr-new' } });
  ivrApi.updateIVR.mockResolvedValue({ data: saved });
});

// A menu that can be saved, made through the hook's own changes.
const fillIn = (result) => act(() => {
  result.current.change({ name: 'Main', greeting: 'ann-1' });
  result.current.change({ noKey: { seconds: 10, type: 'vml', target: 'vml-1' } });
  result.current.change({ wrongKey: { tries: 3, type: 'vml', target: 'vml-1' } });
  result.current.putOption({ key: '1', name: 'Sales', type: 'queue', target: 'q-1' });
});

describe('useIvrMenu', () => {
  it('loads the whole menu when editing, from the server', async () => {
    const { result } = renderHook(() => useIvrMenu({ ivr: { uuid: 'ivr-1' }, mode: 'edit', onSave: vi.fn() }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(ivrApi.getIVR).toHaveBeenCalledWith('ivr-1');
    expect(result.current.menu.options).toEqual([{ key: '1', name: 'Sales', type: 'queue', target: 'q-1' }]);
    expect(result.current.environmentUuid).toBe('env-9');
  });

  it('creates a new menu in the given environment', async () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useIvrMenu({ mode: 'create', environmentUuid: 'env-1', onSave }));
    fillIn(result);
    await act(() => result.current.save());
    expect(ivrApi.createIVR).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Main', environment_uuid: 'env-1', announcement_uuid: 'ann-1',
      entries: { 1: { name: 'Sales', bridge_type: 'queue', bridge_uuid: 'q-1' } },
    }));
    expect(onSave).toHaveBeenCalledWith({ uuid: 'ivr-new' });
  });

  it('updates the menu it edits', async () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useIvrMenu({ ivr: { uuid: 'ivr-1' }, mode: 'edit', onSave }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.change({ name: 'Renamed' }));
    await act(() => result.current.save());
    expect(ivrApi.updateIVR).toHaveBeenCalledWith('ivr-1', expect.objectContaining({ name: 'Renamed', environment_uuid: 'env-9' }));
    expect(onSave).toHaveBeenCalled();
  });

  it('shows what is missing only after a save, and sends nothing', async () => {
    const { result } = renderHook(() => useIvrMenu({ mode: 'create', environmentUuid: 'env-1', onSave: vi.fn() }));
    expect(result.current.errors).toEqual({});
    await act(() => result.current.save());
    expect(result.current.errors.name).toBe('nameRequired');
    expect(ivrApi.createIVR).not.toHaveBeenCalled();
  });

  it("keeps the server's refusal to show it", async () => {
    ivrApi.createIVR.mockRejectedValue(new Error('Name already taken'));
    const onSave = vi.fn();
    const { result } = renderHook(() => useIvrMenu({ mode: 'create', environmentUuid: 'env-1', onSave }));
    fillIn(result);
    await act(() => result.current.save());
    expect(result.current.saveError).toBe('Name already taken');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('replaces an option by its key, and removes one', () => {
    const { result } = renderHook(() => useIvrMenu({ mode: 'create', environmentUuid: 'env-1', onSave: vi.fn() }));
    act(() => {
      result.current.putOption({ key: '2', name: 'Support', type: 'queue', target: 'q-2' });
      result.current.putOption({ key: '1', name: 'Sales', type: 'queue', target: 'q-1' });
      result.current.putOption({ key: '2', name: 'Help', type: 'queue', target: 'q-2' });
    });
    expect(result.current.menu.options.map((o) => `${o.key}:${o.name}`)).toEqual(['1:Sales', '2:Help']);
    act(() => result.current.removeOption('1'));
    expect(result.current.menu.options.map((o) => o.key)).toEqual(['2']);
  });

  it('changes part of a fallback, keeping the rest', () => {
    const { result } = renderHook(() => useIvrMenu({ mode: 'create', environmentUuid: 'env-1', onSave: vi.fn() }));
    act(() => result.current.setFallback('noKey', { type: 'vml', target: 'vml-1' }));
    act(() => result.current.setFallback('noKey', { seconds: 20 }));
    expect(result.current.menu.noKey).toEqual({ seconds: 20, type: 'vml', target: 'vml-1' });
  });
});

describe('useBridgeResources', () => {
  beforeEach(() => {
    bridgeApi.getBridgeResources.mockResolvedValue([{ uuid: 'q-1', name: 'Sales team' }]);
  });

  it("loads a type's items once, for the environment, and names them", async () => {
    const { result } = renderHook(() => useBridgeResources('env-1'));
    act(() => { result.current.load('queue'); result.current.load('queue'); });
    await waitFor(() => expect(result.current.resource('queue').status).toBe('done'));
    expect(bridgeApi.getBridgeResources).toHaveBeenCalledTimes(1);
    expect(bridgeApi.getBridgeResources).toHaveBeenCalledWith('queue', 'env-1');
    expect(result.current.nameOf('queue', 'q-1')).toBe('Sales team');
  });

  it('loads again when asked, after something new was made', async () => {
    const { result } = renderHook(() => useBridgeResources('env-1'));
    await act(() => result.current.load('queue'));
    bridgeApi.getBridgeResources.mockResolvedValue([{ uuid: 'q-1', name: 'Sales team' }, { uuid: 'q-2', name: 'New' }]);
    await act(() => result.current.load('queue', { again: true }));
    expect(result.current.resource('queue').items).toHaveLength(2);
  });

  it('names a number by its number', async () => {
    bridgeApi.getBridgeResources.mockResolvedValue([{ uuid: 'r-1', number: '0541234567' }]);
    const { result } = renderHook(() => useBridgeResources('env-1'));
    await act(() => result.current.load('number'));
    expect(result.current.nameOf('number', 'r-1')).toBe('0541234567');
  });
});

describe('useDestinationChoices', () => {
  it("offers the types the server allows this person, once it answers", async () => {
    bridgeApi.getBridgeTypes.mockResolvedValue(['queue', 'extension']);
    const { result } = renderHook(() => useDestinationChoices());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.map((d) => d.type)).toEqual(['extension', 'queue']);
  });
});
