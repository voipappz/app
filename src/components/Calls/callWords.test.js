import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../i18n';
import { callFieldName, callStatusWord } from './callWords';

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
