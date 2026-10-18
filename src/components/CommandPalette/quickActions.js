import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CallIcon from '@mui/icons-material/Call';
import DialpadIcon from '@mui/icons-material/Dialpad';
import { ASSISTANT_CAN_ANSWER } from '../../services/mcpAssistant';

// Kept with the command palette now that its portal predecessor is gone.
const NUMBER_SHAPE = /^\+?(\(\d{1,4}\)|\d{1,4})([ .-]?(\(\d{1,4}\)|\d{1,4}))*$/;
const DATE_SHAPE = /^\d{4}([-./])\d{1,2}\1\d{1,2}$/;
const looksLikeNumber = (text) => {
  const value = text.trim();
  if (!NUMBER_SHAPE.test(value) || DATE_SHAPE.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 3 && digits.length <= 16;
};

// English defaults; the palette passes translated ones through `labels`.
const DEFAULT_LABELS = {
  ask: (q) => `Ask: “${q}”`,
  askHint: `About ${ASSISTANT_CAN_ANSWER}`,
  call: (q) => `Call ${q}`,
  callHint: 'Opens the phone with the number',
  phone: 'Open phone',
  phoneHint: 'The softphone, on the right',
};

/**
 * The palette's quick actions: ask a question, call a number, open the phone.
 *
 * Pure, so what shows for a given query is a unit test. `keepOpen` rows leave
 * the palette open: Ask swaps the palette's body to the assistant, in place.
 *
 * @param {object} p
 * @param {string} p.query
 * @param {object} p.on  { ask(text), call(number), openPhone() }
 * @param {object} [p.labels]  translated texts, same keys as DEFAULT_LABELS
 */
export function buildQuickActions({ query = '', on, phoneEnabled = true, labels = {} }) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const q = query.trim();
  const rows = [];

  // Anything typed can be a QUESTION, and it is the one row that reads the
  // words rather than matching them, so it comes first.
  if (q) {
    rows.push({
      id: 'quick-ask', label: L.ask(q), description: L.askHint,
      iconComponent: AutoAwesomeIcon, keepOpen: true, action: () => on.ask(q),
    });
  }
  if (phoneEnabled && q && looksLikeNumber(q)) {
    rows.push({
      id: 'quick-call', label: L.call(q), description: L.callHint,
      iconComponent: CallIcon, action: () => on.call(q),
    });
  }
  if (phoneEnabled && (!q || 'open phone'.includes(q.toLowerCase()))) {
    rows.push({
      id: 'quick-phone', label: L.phone, description: L.phoneHint,
      iconComponent: DialpadIcon, action: () => on.openPhone(),
    });
  }
  return rows;
}
