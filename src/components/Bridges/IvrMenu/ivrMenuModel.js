import {
  AccountTree as MenuIcon,
  Campaign as MessageIcon,
  Code as ScriptIcon,
  Forum as ConferenceIcon,
  Headset as QueueIcon,
  AccessTime as HoursIcon,
  Phone as NumberIcon,
  SettingsPhone as DeviceIcon,
  CallSplit as OtherIcon,
  SmartToy as BotIcon,
} from '@mui/icons-material';

// A phone menu (IVR) as a person thinks of it, and the API's shape of it.
// Pure functions: the editor keeps a `menu`, and only these two converters
// know the API keys (POST/PATCH /api/ivrs, form encoded by ivrApi).
//
// menu = {
//   name, enabled,
//   greeting,                                 // announcement uuid
//   options: [{ key, name, type, target }],   // key '0'-'9', '*', '#'
//   noKey:    { seconds, type, target },      // nothing pressed in time
//   wrongKey: { tries, type, target },        // a key with no option
// }

// The keys as a phone shows them, three per row.
export const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// The order a list of options reads in.
const LIST_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'];

// More options than this are hard to remember on a call.
const MOST_OPTIONS = 5;

export const LIMITS = { seconds: { min: 1, max: 300 }, tries: { min: 1, max: 9 } };

// `que` is the API's old spelling of a queue.
const typeOf = (type) => (type === 'que' ? 'queue' : type || '');

const count = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const emptyMenu = () => ({
  name: '',
  enabled: true,
  greeting: '',
  options: [],
  noKey: { seconds: 10, type: '', target: '' },
  wrongKey: { tries: 3, type: '', target: '' },
});

export const sortOptions = (options) =>
  [...options].sort((a, b) => LIST_ORDER.indexOf(a.key) - LIST_ORDER.indexOf(b.key));

// Entries come keyed by digit ({ 1: {...} }); an old answer sends a list
// of { entry, ... }.
const readEntries = (entries) => {
  if (Array.isArray(entries)) return entries.map((e) => [String(e.entry), e]);
  return Object.entries(entries || {});
};

export function fromIvr(ivr) {
  if (!ivr) return emptyMenu();
  const empty = emptyMenu();
  return {
    name: ivr.name || '',
    enabled: ivr.enabled ?? true,
    greeting: ivr.announcement_uuid || '',
    options: sortOptions(readEntries(ivr.entries).map(([key, entry]) => ({
      key: String(key),
      name: entry?.name || '',
      type: typeOf(entry?.bridge_type),
      target: entry?.bridge_uuid || '',
    }))),
    noKey: {
      seconds: count(ivr.timeout, empty.noKey.seconds),
      type: typeOf(ivr.timeout_bridge_type),
      target: ivr.timeout_bridge_uuid || '',
    },
    wrongKey: {
      tries: count(ivr.invalid, empty.wrongKey.tries),
      type: typeOf(ivr.invalid_bridge_type),
      target: ivr.invalid_bridge_uuid || '',
    },
  };
}

export function toIvrPayload(menu, environmentUuid) {
  const entries = {};
  menu.options.forEach((option) => {
    entries[option.key] = { name: option.name.trim(), bridge_type: option.type, bridge_uuid: option.target };
  });
  return {
    name: menu.name.trim(),
    enabled: menu.enabled,
    environment_uuid: environmentUuid,
    announcement_uuid: menu.greeting,
    timeout: menu.noKey.seconds,
    timeout_bridge_type: menu.noKey.type,
    timeout_bridge_uuid: menu.noKey.target,
    invalid: menu.wrongKey.tries,
    invalid_bridge_type: menu.wrongKey.type,
    invalid_bridge_uuid: menu.wrongKey.target,
    entries,
  };
}

const goesSomewhere = ({ type, target }) => Boolean(type && target);

// A whole number between the limits (a cleared field is '').
const inRange = (value, { min, max }) => Number.isInteger(value) && value >= min && value <= max;

/**
 * What is missing, by place: { name, greeting, 'option.<key>', seconds, noKey, tries, wrongKey }
 * with a message key under `ivrMenu.errors`. Empty when the menu can be saved;
 * the API refuses a menu without a greeting or either fallback.
 */
export function validateMenu(menu) {
  const errors = {};
  if (!menu.name.trim()) errors.name = 'nameRequired';
  if (!menu.greeting) errors.greeting = 'greetingRequired';
  menu.options.forEach((option) => {
    if (!option.name.trim() || !goesSomewhere(option)) errors[`option.${option.key}`] = 'optionIncomplete';
  });
  if (!inRange(menu.noKey.seconds, LIMITS.seconds)) errors.seconds = 'secondsRange';
  if (!goesSomewhere(menu.noKey)) errors.noKey = 'destinationRequired';
  if (!inRange(menu.wrongKey.tries, LIMITS.tries)) errors.tries = 'triesRange';
  if (!goesSomewhere(menu.wrongKey)) errors.wrongKey = 'destinationRequired';
  return errors;
}

// Advice, not errors: the menu still saves. Keys under `ivrMenu.hints`.
export function menuHints(menu) {
  if (menu.options.length === 0) return ['noOptions'];
  if (menu.options.length > MOST_OPTIONS) return ['tooManyOptions'];
  return [];
}

/**
 * The places a key can send a caller that this editor knows, in the order the
 * picker lists them. `creatable` types have an editor the route wizard can open
 * for a new one. Names are under `ivrMenu.types.<type>`.
 */
const DESTINATION_TYPES = [
  { type: 'extension', icon: DeviceIcon, creatable: false },
  { type: 'queue', icon: QueueIcon, creatable: true },
  { type: 'ivr', icon: MenuIcon, creatable: true },
  { type: 'announcement', icon: MessageIcon, creatable: true },
  { type: 'call_condition', icon: HoursIcon, creatable: true },
  { type: 'vml', icon: ScriptIcon, creatable: true },
  { type: 'conference', icon: ConferenceIcon, creatable: false },
  { type: 'number', icon: NumberIcon, creatable: false },
  { type: 'bot', icon: BotIcon, creatable: true },
];

const destinationType = (type) => DESTINATION_TYPES.find((d) => d.type === type);

/**
 * The picker's choices: the types the server offers this person (GET
 * /api/assets/bridge_types), known ones first in the usual order. A new one
 * may be made of a creatable type when `canWrite` (the routes write grant,
 * usePermissions' canWriteDestinations).
 */
export function destinationChoices(offered, canWrite) {
  const types = [...new Set(offered.map(typeOf))];
  const known = DESTINATION_TYPES.filter((d) => types.includes(d.type));
  const others = types.filter((type) => !destinationType(type)).map((type) => ({ type, icon: OtherIcon, creatable: false }));
  return [...known, ...others].map((d) => ({ ...d, canCreate: d.creatable && Boolean(canWrite) }));
}

// What a person calls a place: its name, or a number's number.
export const itemLabel = (item) => (item ? item.name || item.number || item.uuid : '');
