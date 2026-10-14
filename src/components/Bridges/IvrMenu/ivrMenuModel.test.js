import { describe, expect, it } from 'vitest';
import {
  KEYPAD, destinationChoices, emptyMenu, fromIvr, itemLabel, menuHints, sortOptions,
  toIvrPayload, validateMenu,
} from './ivrMenuModel';

// What GET /api/ivrs/:id answers.
const ivr = {
  uuid: 'ivr-1',
  name: 'Main menu',
  enabled: true,
  environment_uuid: 'env-1',
  announcement_uuid: 'ann-1',
  timeout: 5,
  timeout_bridge_type: 'vml',
  timeout_bridge_uuid: 'vml-1',
  invalid: 2,
  invalid_bridge_type: 'extension',
  invalid_bridge_uuid: 'ext-200',
  entries: {
    2: { uuid: 'e2', ivr_uuid: 'ivr-1', name: 'Support', bridge_type: 'extension', bridge_uuid: 'ext-201' },
    1: { uuid: 'e1', ivr_uuid: 'ivr-1', name: 'Sales', bridge_type: 'que', bridge_uuid: 'q-1' },
  },
};

describe('fromIvr', () => {
  it('reads the menu a caller hears, options in keypad order', () => {
    const menu = fromIvr(ivr);
    expect(menu).toEqual({
      name: 'Main menu',
      enabled: true,
      greeting: 'ann-1',
      options: [
        { key: '1', name: 'Sales', type: 'queue', target: 'q-1' },
        { key: '2', name: 'Support', type: 'extension', target: 'ext-201' },
      ],
      noKey: { seconds: 5, type: 'vml', target: 'vml-1' },
      wrongKey: { tries: 2, type: 'extension', target: 'ext-200' },
    });
  });

  it('reads entries sent as a list', () => {
    const menu = fromIvr({ entries: [{ entry: '#', name: 'Back', bridge_type: 'ivr', bridge_uuid: 'ivr-0' }] });
    expect(menu.options).toEqual([{ key: '#', name: 'Back', type: 'ivr', target: 'ivr-0' }]);
  });

  it('starts a new menu with the usual waits', () => {
    expect(fromIvr(null)).toEqual(emptyMenu());
    expect(emptyMenu().noKey.seconds).toBe(10);
    expect(emptyMenu().wrongKey.tries).toBe(3);
  });
});

describe('toIvrPayload', () => {
  it('writes back exactly the keys the API takes', () => {
    expect(toIvrPayload(fromIvr(ivr), 'env-1')).toEqual({
      name: 'Main menu',
      enabled: true,
      environment_uuid: 'env-1',
      announcement_uuid: 'ann-1',
      timeout: 5,
      timeout_bridge_type: 'vml',
      timeout_bridge_uuid: 'vml-1',
      invalid: 2,
      invalid_bridge_type: 'extension',
      invalid_bridge_uuid: 'ext-200',
      entries: {
        1: { name: 'Sales', bridge_type: 'queue', bridge_uuid: 'q-1' },
        2: { name: 'Support', bridge_type: 'extension', bridge_uuid: 'ext-201' },
      },
    });
  });

  it('trims the names', () => {
    const menu = { ...emptyMenu(), name: '  Main  ', options: [{ key: '1', name: ' Sales ', type: 'queue', target: 'q' }] };
    const payload = toIvrPayload(menu, 'env-1');
    expect(payload.name).toBe('Main');
    expect(payload.entries['1'].name).toBe('Sales');
  });
});

describe('keys', () => {
  it('lays the keypad out like a phone', () => {
    expect(KEYPAD).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']);
  });

  it('sorts 1 to 9, then 0, *, #', () => {
    const keys = sortOptions([{ key: '#' }, { key: '0' }, { key: '*' }, { key: '9' }, { key: '1' }]).map((o) => o.key);
    expect(keys).toEqual(['1', '9', '0', '*', '#']);
  });
});

describe('validateMenu', () => {
  const complete = fromIvr(ivr);

  it('accepts a complete menu', () => {
    expect(validateMenu(complete)).toEqual({});
  });

  it('names each missing piece by its place', () => {
    const errors = validateMenu({
      ...complete,
      name: ' ',
      greeting: '',
      options: [{ key: '1', name: '', type: 'queue', target: '' }],
      noKey: { seconds: '', type: '', target: '' },
      wrongKey: { tries: 12, type: 'vml', target: '' },
    });
    expect(errors).toEqual({
      name: 'nameRequired',
      greeting: 'greetingRequired',
      'option.1': 'optionIncomplete',
      seconds: 'secondsRange',
      noKey: 'destinationRequired',
      tries: 'triesRange',
      wrongKey: 'destinationRequired',
    });
  });
});

describe('menuHints', () => {
  it('says when there are no options, or too many to remember', () => {
    expect(menuHints({ options: [] })).toEqual(['noOptions']);
    expect(menuHints({ options: [1, 2, 3, 4, 5].map((k) => ({ key: String(k) })) })).toEqual([]);
    expect(menuHints({ options: [1, 2, 3, 4, 5, 6].map((k) => ({ key: String(k) })) })).toEqual(['tooManyOptions']);
  });
});

// `can` as usePermissions gives it, from an ACL of { key: [permissions] }.
const canFrom = (acl) => (key, action = 'read') => (acl[key] || []).includes(action);

describe('destinationChoices', () => {
  it("offers what the server offers, in the picker's order", () => {
    expect(destinationChoices(['number', 'extension', 'que'], canFrom({})).map((d) => d.type))
      .toEqual(['extension', 'queue', 'number']);
  });

  it('keeps a type this editor does not know, with a plain icon', () => {
    const [other] = destinationChoices(['user_login'], canFrom({ user_login: ['read', 'write'] }));
    expect(other).toMatchObject({ type: 'user_login', canCreate: false });
    expect(other.icon).toBeTruthy();
  });

  it('lets a person make a new one only where the role can write it', () => {
    const can = canFrom({ queue: ['read'], announcement: ['read', 'write'], extension: ['read', 'write'] });
    const byType = Object.fromEntries(destinationChoices(['queue', 'announcement', 'extension'], can).map((d) => [d.type, d.canCreate]));
    expect(byType).toEqual({ extension: false, queue: false, announcement: true });
  });
});

describe('itemLabel', () => {
  it('names a place by its name, or a number by its number', () => {
    expect(itemLabel({ uuid: 'q-1', name: 'Sales team' })).toBe('Sales team');
    expect(itemLabel({ uuid: 'r-1', number: '0541234567' })).toBe('0541234567');
    expect(itemLabel(undefined)).toBe('');
  });
});
