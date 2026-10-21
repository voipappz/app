import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../i18n';
import { callFieldName, callStatusWord, callValueName } from './callWords';

afterEach(() => i18n.changeLanguage('en'));

describe('callFieldName', () => {
  it('keeps the name as sent in English', () => {
    expect(callFieldName('profile.talk_duration', 'Talk Duration')).toBe('Talk Duration');
    expect(callFieldName('call.cause', 'Call Result')).toBe('Call Result');
  });

  it("uses the app's own name in Hebrew, and the name as sent for an unknown field", async () => {
    await i18n.changeLanguage('he');
    expect(callFieldName('profile.talk_duration', 'Talk Duration')).toBe('משך שיחה');
    expect(callFieldName('environment', 'Environment')).toBe('אפליקציה');
    expect(callFieldName('profile.something_new', 'Something New')).toBe('Something New');
  });

  // The API filters a record by its uuid: campaign_uuid, queue_uuid, call.ivr_uuid.
  it('names a filter on a record by the record, in Hebrew', async () => {
    await i18n.changeLanguage('he');
    expect(callFieldName('campaign_uuid', 'Campaign')).toBe('קמפיין');
    expect(callFieldName('queue_uuid', 'Queue')).toBe('תור');
    expect(callFieldName('call.ivr_uuid', 'IVR')).toBe('תפריט קולי');
    expect(callFieldName('billing_duration', 'Billing Duration')).toBe('משך לחיוב');
  });
});

describe('callValueName', () => {
  it("keeps the API's name in English, says a known value in Hebrew, and keeps a record's name", async () => {
    expect(callValueName('answer', 'answer')).toBe('answer');
    await i18n.changeLanguage('he');
    expect(callValueName('no_answer', 'no_answer')).toBe('לא נענתה');
    expect(callValueName('5f1c-uuid', 'Sales queue')).toBe('Sales queue');
  });
});

describe('callStatusWord', () => {
  it('says a known value in the active language and tidies an unknown one', async () => {
    expect(callStatusWord('no_answer')).toBe('No Answer');
    expect(callStatusWord('NORMAL_CLEARING')).toBe('NORMAL CLEARING');
    await i18n.changeLanguage('he');
    expect(callStatusWord('no-answer')).toBe('לא נענתה');
    expect(callStatusWord('hangup_complete')).toBe('Hangup Complete');
  });
});
