/**
 * Business hours <-> the API's call condition rules.
 *
 * The API (docs/call-conditions-api.md in the api repo): a call condition is
 * an ordered list of rules plus a fallback. On a call the FIRST rule whose
 * conditions (segments) ALL match wins; no match -> the fallback.
 *
 * The page shows it the way people think about it:
 *   - more rules (cards), checked first
 *   - business hours: per day, open or closed, with hours -> "while open"
 *   - otherwise -> the fallback
 *
 * Hours are whole hours. A range is shown as From-To with To exclusive
 * ("09:00-17:00" stops at 17:00), while the API's `time.hour BETWEEN [a, b]`
 * includes all of hour b, so To is sent as b = To - 1. Days: 0 = Sunday.
 */

export const DAYS = [0, 1, 2, 3, 4, 5, 6];
export const NAME_PATTERN = /^[0-9a-zA-Z_-]+$/;
export const MAX_RANGES_PER_DAY = 3;

// Destination types a RULE may send to (the API's resource list; `que` is
// written `queue` everywhere). The fallback uses the API's own list.
export const RULE_TARGET_TYPES = ['extension', 'queue', 'ivr', 'announcement', 'number', 'call_condition', 'vml', 'conference', 'bot'];

export const emptyTarget = () => ({ type: '', uuid: '' });
export const closedDay = () => ({ open: false, ranges: [] });
export const defaultRange = () => ({ from: 9, to: 17 });

export const emptyForm = () => ({
  name: '',
  notes: '',
  week: DAYS.map(closedDay),
  openTarget: emptyTarget(),
  otherwise: emptyTarget(),
  rules: [],
});

const normalizeType = (type) => (type === 'que' ? 'queue' : type || '');
const toNumbers = (values) => (Array.isArray(values) ? values : [values]).map(Number);

// A space typed in a name becomes "_", the only spelling the API accepts.
export const tidyName = (text) => text.replace(/\s+/g, '_');
export const isValidName = (name) => NAME_PATTERN.test(name);

let ruleIdCounter = 0;
export const newRuleId = () => {
  ruleIdCounter += 1;
  return `rule-${ruleIdCounter}`;
};

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

const daysSegment = (days) => ({ field: 'time.weekday', operator: 'IN', value: [...days].sort((a, b) => a - b).map(String) });
const hoursSegment = (from, to) => ({ field: 'time.hour', operator: 'BETWEEN', value: [String(from), String(to - 1)] });

// What a segment means, as a key: two segments with the same key are the same
// condition, so a saved one can be sent back instead of creating it again.
export const segmentKey = (segment) => {
  const values = toNumbersOrText(segment.value ?? segment.val);
  return `${segment.field}|${segment.operator}|${values.join(',')}`;
};
const toNumbersOrText = (values) => {
  const list = Array.isArray(values) ? values : [values];
  return list.map((value) => String(value).trim());
};

// Days and hours as segments. All 7 days -> no days segment; all day -> no
// hours segment.
const timeSegments = (days, range) => {
  const segments = [];
  if (days.length < 7) segments.push(daysSegment(days));
  if (range && !(range.from === 0 && range.to === 24)) segments.push(hoursSegment(range.from, range.to));
  return segments;
};

// ---------------------------------------------------------------------------
// Form -> API rules
// ---------------------------------------------------------------------------

// Days that share the same hours become one rule: "Sun-Thu 09-17" is one
// rule, not five.
export const weekToGroups = (week) => {
  const groups = new Map();
  week.forEach((day, dayIndex) => {
    if (!day.open) return;
    day.ranges.forEach((range) => {
      const key = `${range.from}-${range.to}`;
      if (!groups.has(key)) groups.set(key, { range, days: [] });
      groups.get(key).days.push(dayIndex);
    });
  });
  return [...groups.values()].sort((a, b) => a.range.from - b.range.from || a.range.to - b.range.to);
};

// A card's conditions as segments.
export const ruleSegments = (rule) => {
  switch (rule.kind) {
    case 'caller':
    case 'dialled': {
      const field = rule.kind === 'caller' ? 'call.caller' : 'call.destination';
      const values = rule.operator === 'IN'
        ? rule.value.split(',').map((v) => v.trim()).filter(Boolean)
        : [rule.value.trim()];
      return [{ field, operator: rule.operator, value: values }];
    }
    case 'time':
      return timeSegments(rule.days, rule.allDay ? null : { from: rule.from, to: rule.to });
    case 'month':
      return [{ field: 'time.month', operator: 'IN', value: [...rule.months].sort((a, b) => a - b).map(String) }];
    default:
      return [];
  }
};

/**
 * The rules to send, in order: the cards first (checked before the hours),
 * then one rule per group of days with the same hours. Each rule carries the
 * segments it needs; a card kept as it was (`kept`) carries its saved
 * segment uuids instead. Names are generated: the API needs them unique
 * within the condition and never sends them back.
 */
export const formToRules = (form) => {
  const cards = form.rules.map((rule, index) => ({
    name: `rule_${index + 1}`,
    bridge_type: rule.target.type,
    bridge_uuid: rule.target.uuid,
    ...(rule.kind === 'kept' ? { segment_uuids: rule.segmentUuids } : { segments: ruleSegments(rule) }),
  }));
  const hours = weekToGroups(form.week).map((group, index) => ({
    name: `open_${index + 1}`,
    bridge_type: form.openTarget.type,
    bridge_uuid: form.openTarget.uuid,
    segments: timeSegments(group.days, group.range),
  }));
  return [...cards, ...hours];
};

// ---------------------------------------------------------------------------
// API condition -> form
// ---------------------------------------------------------------------------

const segmentsOf = (resource) => (resource.segments || []).map((segment) => ({
  uuid: segment.uuid,
  field: segment.field,
  operator: segment.operator,
  value: segment.val ?? segment.value ?? [],
}));

// Days and hours of a rule that has only those (each at most once).
// Returns null for anything else.
const readTime = (segments) => {
  if (segments.length === 0 || segments.length > 2) return null;
  let days = DAYS;
  let range = null;
  const seen = new Set();
  for (const segment of segments) {
    if (seen.has(segment.field)) return null;
    seen.add(segment.field);
    if (segment.field === 'time.weekday' && segment.operator === 'IN') {
      days = toNumbers(segment.value).filter((d) => d >= 0 && d <= 6);
    } else if (segment.field === 'time.hour' && segment.operator === 'BETWEEN') {
      const [from, last] = toNumbers(segment.value);
      // Overnight (22-6) does not fit a day row; leave it to a kept card.
      if (!(from >= 0 && last >= from && last <= 23)) return null;
      range = { from, to: last + 1 };
    } else {
      return null;
    }
  }
  return { days, range: range || { from: 0, to: 24 } };
};

// A card for one saved rule; `kept` when the page cannot show it.
const readCard = (resource, segments) => {
  const target = { type: normalizeType(resource.bridge_type), uuid: resource.bridge_uuid || '' };
  const kept = { id: newRuleId(), kind: 'kept', target, segmentUuids: segments.map((s) => s.uuid).filter(Boolean), segments };
  const time = readTime(segments);
  if (time) {
    const allDay = time.range.from === 0 && time.range.to === 24;
    return { id: newRuleId(), kind: 'time', target, days: time.days, allDay, from: allDay ? 9 : time.range.from, to: allDay ? 17 : time.range.to };
  }
  if (segments.length !== 1) return kept;
  const [segment] = segments;
  const values = toNumbersOrText(segment.value);
  if ((segment.field === 'call.caller' || segment.field === 'call.destination') && ['IS', 'PREFIX', 'IN'].includes(segment.operator)) {
    return { id: newRuleId(), kind: segment.field === 'call.caller' ? 'caller' : 'dialled', target, operator: segment.operator, value: values.join(', ') };
  }
  if (segment.field === 'time.month' && segment.operator === 'IN') {
    return { id: newRuleId(), kind: 'month', target, months: toNumbers(segment.value).filter((m) => m >= 1 && m <= 12) };
  }
  return kept;
};

/**
 * Reads a saved condition back into the form. The trailing rules that are
 * only days/hours, all to the same destination, are the business hours;
 * every rule before them is a card, in its order. Rule order -- and so what
 * happens to a call -- never changes, and a rule the page cannot show stays
 * as a `kept` card, saved back untouched.
 */
export const conditionToForm = (condition) => {
  const form = emptyForm();
  form.name = condition?.name || '';
  form.notes = condition?.notes || '';
  form.otherwise = { type: normalizeType(condition?.fallback_bridge_type), uuid: condition?.fallback_bridge_uuid || '' };

  const resources = condition?.resources || [];
  let start = resources.length;
  let openTarget = null;
  for (let i = resources.length - 1; i >= 0; i -= 1) {
    const resource = resources[i];
    const target = { type: normalizeType(resource.bridge_type), uuid: resource.bridge_uuid || '' };
    if (!readTime(segmentsOf(resource))) break;
    if (openTarget && (openTarget.type !== target.type || openTarget.uuid !== target.uuid)) break;
    openTarget = target;
    start = i;
  }

  resources.slice(start).forEach((resource) => {
    const { days, range } = readTime(segmentsOf(resource));
    days.forEach((day) => {
      const row = form.week[day];
      row.open = true;
      if (!row.ranges.some((r) => r.from === range.from && r.to === range.to)) row.ranges.push({ ...range });
      row.ranges.sort((a, b) => a.from - b.from);
    });
  });
  if (openTarget) form.openTarget = openTarget;
  form.rules = resources.slice(0, start).map((resource) => readCard(resource, segmentsOf(resource)));
  return form;
};

// Saved segments by meaning, so an unchanged condition is sent back by uuid.
export const savedSegmentIndex = (condition) => {
  const index = new Map();
  (condition?.resources || []).forEach((resource) => {
    segmentsOf(resource).forEach((segment) => {
      if (segment.uuid) index.set(segmentKey(segment), segment.uuid);
    });
  });
  return index;
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const targetMissing = (target) => !target.type || !target.uuid;

/**
 * What still has to be filled in, as translation keys by field. Empty means
 * the form can be saved.
 */
export const validateForm = (form) => {
  const errors = {};
  if (!form.name) errors.name = 'errors.nameRequired';
  else if (!isValidName(form.name)) errors.name = 'errors.nameFormat';

  const anyOpen = form.week.some((day) => day.open);
  form.week.forEach((day, dayIndex) => {
    if (!day.open) return;
    if (day.ranges.length === 0) errors[`day${dayIndex}`] = 'errors.noHours';
    else if (day.ranges.some((r) => r.to <= r.from)) errors[`day${dayIndex}`] = 'errors.endBeforeStart';
  });
  if (anyOpen && targetMissing(form.openTarget)) errors.openTarget = 'errors.destinationRequired';
  if (targetMissing(form.otherwise)) errors.otherwise = 'errors.destinationRequired';
  form.rules.forEach((rule, index) => {
    const problem = ruleProblem(rule);
    if (problem) errors[`rule${index}`] = problem;
  });
  return errors;
};

// A card's own problem, as a translation key, or null.
export const ruleProblem = (rule) => {
  if (targetMissing(rule.target)) return 'errors.destinationRequired';
  if ((rule.kind === 'caller' || rule.kind === 'dialled') && !rule.value.trim()) return 'errors.valueRequired';
  if (rule.kind === 'time') {
    if (rule.days.length === 0) return 'errors.daysRequired';
    if (!rule.allDay && rule.to <= rule.from) return 'errors.endBeforeStart';
  }
  if (rule.kind === 'month' && rule.months.length === 0) return 'errors.monthsRequired';
  return null;
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const rangesKey = (day) => (day.open ? day.ranges.map((r) => `${r.from}-${r.to}`).join(',') : 'closed');

/**
 * The week in runs of consecutive days with the same hours, Sunday first:
 * [{ from: 0, to: 4, open: true, ranges }, { from: 5, to: 5, ... }, ...].
 */
export const weekRuns = (week) => {
  const runs = [];
  week.forEach((day, index) => {
    const last = runs[runs.length - 1];
    if (last && last.key === rangesKey(day)) last.to = index;
    else runs.push({ key: rangesKey(day), from: index, to: index, open: day.open, ranges: day.ranges });
  });
  return runs;
};

export const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`;
