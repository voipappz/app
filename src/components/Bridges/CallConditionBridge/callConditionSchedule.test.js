import { describe, expect, it } from 'vitest';
import {
  conditionToForm, emptyForm, formToRules, savedSegmentIndex, segmentKey, tidyName, validateForm, weekRuns,
} from './callConditionSchedule';

const queue = { type: 'queue', uuid: 'q-1' };
const vml = { type: 'vml', uuid: 'v-1' };
const open = (from, to) => ({ open: true, ranges: [{ from, to }] });
const closed = { open: false, ranges: [] };

// Sun-Thu 09-17, Fri 09-13, Sat closed.
const officeWeek = () => [open(9, 17), open(9, 17), open(9, 17), open(9, 17), open(9, 17), open(9, 13), closed];
const officeForm = () => ({ ...emptyForm(), name: 'office_hours', week: officeWeek(), openTarget: queue, otherwise: vml });

describe('formToRules', () => {
  it('makes one rule per group of days with the same hours, the end hour sent as the last hour included', () => {
    const rules = formToRules(officeForm());
    expect(rules).toEqual([
      {
        name: 'open_1', bridge_type: 'queue', bridge_uuid: 'q-1',
        segments: [
          { field: 'time.weekday', operator: 'IN', value: ['5'] },
          { field: 'time.hour', operator: 'BETWEEN', value: ['9', '12'] },
        ],
      },
      {
        name: 'open_2', bridge_type: 'queue', bridge_uuid: 'q-1',
        segments: [
          { field: 'time.weekday', operator: 'IN', value: ['0', '1', '2', '3', '4'] },
          { field: 'time.hour', operator: 'BETWEEN', value: ['9', '16'] },
        ],
      },
    ]);
  });

  it('gives a split day two rules', () => {
    const form = { ...officeForm(), week: [{ open: true, ranges: [{ from: 9, to: 13 }, { from: 14, to: 18 }] }, closed, closed, closed, closed, closed, closed] };
    const hours = formToRules(form).map((rule) => rule.segments[1].value);
    expect(hours).toEqual([['9', '12'], ['14', '17']]);
  });

  it('leaves out the days for every day, and the hours for all day', () => {
    const form = { ...officeForm(), week: Array.from({ length: 7 }, () => open(0, 24)) };
    expect(formToRules(form)).toEqual([{ name: 'open_1', bridge_type: 'queue', bridge_uuid: 'q-1', segments: [] }]);
  });

  it('puts the extra rules first, in their order', () => {
    const form = {
      ...officeForm(),
      rules: [
        { kind: 'caller', operator: 'PREFIX', value: '+97250', target: { type: 'extension', uuid: 'e-1' } },
        { kind: 'month', months: [8], target: { type: 'announcement', uuid: 'a-1' } },
      ],
    };
    const rules = formToRules(form);
    expect(rules.map((r) => r.name)).toEqual(['rule_1', 'rule_2', 'open_1', 'open_2']);
    expect(rules[0].segments).toEqual([{ field: 'call.caller', operator: 'PREFIX', value: ['+97250'] }]);
    expect(rules[1].segments).toEqual([{ field: 'time.month', operator: 'IN', value: ['8'] }]);
  });

  it('splits a list of numbers', () => {
    const form = { ...officeForm(), rules: [{ kind: 'dialled', operator: 'IN', value: '100, 200,,300', target: queue }] };
    expect(formToRules(form)[0].segments[0].value).toEqual(['100', '200', '300']);
  });

  it('sends a kept rule back by its saved segments', () => {
    const form = { ...officeForm(), rules: [{ kind: 'kept', segmentUuids: ['s-9'], target: queue }] };
    expect(formToRules(form)[0]).toEqual({ name: 'rule_1', bridge_type: 'queue', bridge_uuid: 'q-1', segment_uuids: ['s-9'] });
  });
});

// The API's shape: resources in priority order, each with its segments.
const resource = (target, segments) => ({
  bridge_type: target.type, bridge_uuid: target.uuid,
  segments: segments.map(([uuid, field, operator, val]) => ({ uuid, field, operator, val })),
});

describe('conditionToForm', () => {
  it('reads saved rules back into the same week', () => {
    const condition = {
      name: 'office_hours', notes: 'n', fallback_bridge_type: 'vml', fallback_bridge_uuid: 'v-1',
      resources: formToRules(officeForm()).map((rule) => resource(
        { type: rule.bridge_type, uuid: rule.bridge_uuid },
        rule.segments.map((s, i) => [`s-${i}`, s.field, s.operator, s.value]),
      )),
    };
    const form = conditionToForm(condition);
    expect(form.week).toEqual(officeWeek());
    expect(form.openTarget).toEqual(queue);
    expect(form.otherwise).toEqual(vml);
    expect(form.rules).toEqual([]);
    expect(form.notes).toBe('n');
  });

  it('keeps the order: rules before the hours become cards', () => {
    const condition = {
      fallback_bridge_type: 'vml', fallback_bridge_uuid: 'v-1',
      resources: [
        resource({ type: 'extension', uuid: 'e-1' }, [['s-1', 'call.caller', 'PREFIX', ['+97250']]]),
        resource({ type: 'announcement', uuid: 'a-1' }, [['s-2', 'time.weekday', 'IN', ['6']], ['s-3', 'time.hour', 'BETWEEN', ['10', '11']]]),
        resource(queue, [['s-4', 'time.weekday', 'IN', ['0', '1']], ['s-5', 'time.hour', 'BETWEEN', ['8', '16']]]),
      ],
    };
    const form = conditionToForm(condition);
    expect(form.rules.map((r) => r.kind)).toEqual(['caller', 'time']);
    expect(form.rules[0]).toMatchObject({ operator: 'PREFIX', value: '+97250', target: { type: 'extension', uuid: 'e-1' } });
    expect(form.rules[1]).toMatchObject({ days: [6], allDay: false, from: 10, to: 12 });
    expect(form.week[0]).toEqual(open(8, 17));
    expect(form.week[6]).toEqual(closed);
  });

  it('treats `que` as a queue', () => {
    const form = conditionToForm({ resources: [resource({ type: 'que', uuid: 'q-1' }, [['s', 'time.hour', 'BETWEEN', ['9', '16']]])] });
    expect(form.openTarget).toEqual(queue);
    expect(form.week.every((day) => day.open)).toBe(true);
  });

  it('keeps a rule it cannot show, untouched', () => {
    const condition = { resources: [resource(queue, [['s-1', 'sip.user_agent', 'CONTAINS', ['Yealink']]]), resource(vml, [])] };
    const form = conditionToForm(condition);
    expect(form.rules.map((r) => r.kind)).toEqual(['kept', 'kept']);
    expect(formToRules({ ...form, name: 'x' })[0].segment_uuids).toEqual(['s-1']);
  });

  it('keeps an overnight range as a rule it cannot show', () => {
    const form = conditionToForm({ resources: [resource(queue, [['s-1', 'time.hour', 'BETWEEN', ['22', '5']]])] });
    expect(form.rules[0].kind).toBe('kept');
  });
});

describe('savedSegmentIndex', () => {
  it('finds a saved segment by what it means, so it is sent back instead of made again', () => {
    const condition = { resources: [resource(queue, [['s-1', 'time.weekday', 'IN', ['1', '0']]])] };
    const index = savedSegmentIndex(condition);
    expect(index.get(segmentKey({ field: 'time.weekday', operator: 'IN', value: ['1', '0'] }))).toBe('s-1');
  });
});

describe('validateForm', () => {
  it('passes a complete form', () => {
    expect(validateForm(officeForm())).toEqual({});
  });

  it('asks for what is missing', () => {
    const form = { ...emptyForm(), name: 'office hours', week: [open(17, 9), ...officeWeek().slice(1)] };
    expect(validateForm(form)).toMatchObject({
      name: 'errors.nameFormat',
      day0: 'errors.endBeforeStart',
      openTarget: 'errors.destinationRequired',
      otherwise: 'errors.destinationRequired',
    });
  });

  it('needs no "while open" destination when closed all week', () => {
    expect(validateForm({ ...emptyForm(), name: 'x', otherwise: vml })).toEqual({});
  });
});

describe('helpers', () => {
  it('turns spaces into the only separator the API accepts', () => {
    expect(tidyName('office hours  2')).toBe('office_hours_2');
  });

  it('sums the week up in runs of days', () => {
    expect(weekRuns(officeWeek()).map((run) => [run.from, run.to, run.open])).toEqual([[0, 4, true], [5, 5, true], [6, 6, false]]);
  });
});
