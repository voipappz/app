/**
 * Shared chip color/label utilities for consistent chip rendering across all screens.
 * Labels are in the active language (common.json `chip.*`), read when called.
 */
import i18n from '../i18n';

const chipText = (key) => i18n.t(`common:chip.${key}`);

/**
 * Enabled chip props: green "Yes" / grey "No"
 */
export const getEnabledChipProps = (enabled) => ({
  label: chipText(enabled ? 'yes' : 'no'),
  color: enabled ? 'success' : 'default',
  size: 'small',
});

/**
 * Status lifecycle chips: active=success, suspended=warning, cancelled=error, pending=info
 */
export const getStatusChipProps = (status) => {
  const map = {
    active: { key: 'active', color: 'success' },
    suspended: { key: 'suspended', color: 'warning' },
    cancelled: { key: 'cancelled', color: 'error' },
    pending: { key: 'pending', color: 'info' },
    // Campaign-specific statuses
    create: { key: 'created', color: 'default' },
    run: { key: 'running', color: 'success' },
    pause: { key: 'paused', color: 'warning' },
    stop: { key: 'stopped', color: 'error' },
  };
  const found = map[status];
  if (found) return { label: chipText(found.key), color: found.color, size: 'small' };
  return { label: status || chipText('unknown'), color: 'default', size: 'small' };
};

/**
 * Unified type chip color map for all entity types (providers, DIDs, campaigns, templates, etc.)
 */
export const getTypeChipColor = (type) => {
  const colorMap = {
    // DID types
    sip: 'primary',
    pstn: 'secondary',
    toll_free: 'info',
    // Provider types
    did: 'primary',
    sms: 'info',
    carrier: 'success',
    trunk: 'warning',
    gateway: 'info',
    webhook: 'secondary',
    caller_id_number: 'default',
    tts: 'success',
    azure_tts: 'success',
    smtp: 'warning',
    // Campaign types
    call: 'primary',
    // Template types
    account: 'secondary',
    user: 'info',
    voicemail: 'warning',
    facsimile: 'default',
    conference: 'success',
    subscription: 'secondary',
    reminder: 'warning',
  };
  return colorMap[type] || 'default';
};
