import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { ExtensionBridge } from './ExtensionBridge/ExtensionBridge';
import { deviceErrors } from './ExtensionBridge/deviceRules';
import { FileUploadZone } from './AnnouncementBridge/FileUploadZone';
import { MetaPropertiesEditor } from './shared/MetaPropertiesEditor';

vi.mock('../../services/api/extensionsApi', () => ({ extensionsApi: {} }));
vi.mock('../common/DynamicProfileEditor/DynamicProfileEditor', () => ({ default: () => null }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));

const hebrew = (key, values) => i18n.t(key, { ns: 'bridges', lng: 'he', ...values });
const english = (key, values) => i18n.t(key, { ns: 'bridges', lng: 'en', ...values });

beforeEach(() => i18n.changeLanguage('he'));
afterEach(() => i18n.changeLanguage('en'));

describe('the destination editors in Hebrew', () => {
  it('writes the device form in Hebrew', () => {
    render(<ExtensionBridge open mode="create" containerMode="panel" onClose={() => {}} onSave={() => {}} />);
    expect(screen.getAllByText(hebrew('device.titleCreate')).length).toBeGreaterThan(0);
    expect(hebrew('device.titleCreate')).not.toBe(english('device.titleCreate'));
    expect(screen.queryByText('Create Device')).toBeNull();
  });

  it('gives the device rules in the current language when no translator is passed', () => {
    expect(deviceErrors({ name: '', username: '', password: '' })).toEqual({
      name: hebrew('device.errors.name'),
      username: hebrew('device.errors.number'),
      password: hebrew('device.errors.password'),
    });
  });

  it('writes the upload zone in Hebrew', () => {
    render(<FileUploadZone onFileSelect={() => {}} />);
    expect(screen.getByText(hebrew('announcement.file.drop'))).toBeInTheDocument();
    expect(screen.getByText(hebrew('announcement.file.orClick', { formats: '.mp3, .wav, .ogg', size: 10 }))).toBeInTheDocument();
  });

  it('writes the meta properties editor in Hebrew', () => {
    render(<MetaPropertiesEditor metaFields={[]} onAdd={() => {}} onRemove={() => {}} onUpdate={() => {}} />);
    expect(screen.getByText(hebrew('meta.title'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: hebrew('meta.add') })).toBeInTheDocument();
  });
});
