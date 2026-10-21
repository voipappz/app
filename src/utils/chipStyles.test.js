import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../i18n';
import { getEnabledChipProps, getStatusChipProps } from './chipStyles';

afterEach(() => i18n.changeLanguage('en'));

describe('chip labels', () => {
  it('reads Yes / No and the statuses in English', () => {
    expect(getEnabledChipProps(true)).toEqual({ label: 'Yes', color: 'success', size: 'small' });
    expect(getEnabledChipProps(false).label).toBe('No');
    expect(getStatusChipProps('run')).toEqual({ label: 'Running', color: 'success', size: 'small' });
    expect(getStatusChipProps('archived').label).toBe('archived');
    expect(getStatusChipProps(undefined).label).toBe('Unknown');
  });

  it('follows the active language', async () => {
    await i18n.changeLanguage('he');
    expect(getEnabledChipProps(true).label).toBe('כן');
    expect(getStatusChipProps('active').label).toBe('פעיל');
  });
});
