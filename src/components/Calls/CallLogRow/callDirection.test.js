import { describe, it, expect } from 'vitest';
import { activeCallFilter, callFacts, recordingUrl, shortDuration, withCallFilter } from './callDirection';

const call = (profile) => ({ uuid: 'c1', profile });

describe('callFacts', () => {
  it('shows who called in, and who was called', () => {
    expect(callFacts(call({ direction: 'incoming', cause: 'answer', caller: '0541234567', callee: '201', talk_duration: '151' })))
      .toEqual({ kind: 'incoming', missed: false, number: '0541234567', seconds: 151 });
    expect(callFacts(call({ direction: 'outgoing', cause: 'answer', caller: '201', callee: '035551234' })))
      .toMatchObject({ kind: 'outgoing', number: '035551234' });
  });

  it('marks calls nobody answered', () => {
    expect(callFacts(call({ direction: 'incoming', cause: 'no_answer', caller: '052' }))).toMatchObject({ kind: 'missedIncoming', missed: true });
    expect(callFacts(call({ direction: 'outgoing', cause: 'no_answer', callee: '03' }))).toMatchObject({ kind: 'missedOutgoing', missed: true });
  });

  it('copes with a call it knows little about', () => {
    expect(callFacts({})).toEqual({ kind: 'unknown', missed: false, number: '', seconds: 0 });
  });
});

describe('shortDuration', () => {
  it('writes minutes and seconds, and hours only when there are some', () => {
    expect(shortDuration(0)).toBe('0:00');
    expect(shortDuration(151)).toBe('2:31');
    expect(shortDuration(3725)).toBe('1:02:05');
  });
});

describe('recordingUrl', () => {
  it('finds the recording wherever the call keeps it', () => {
    expect(recordingUrl({ recording: { url: 'a.wav' } })).toBe('a.wav');
    expect(recordingUrl({ profile: { recording_url: 'b.wav' } })).toBe('b.wav');
    expect(recordingUrl({})).toBeNull();
  });
});

describe('the phone filter', () => {
  it('turns a choice into the server search and back', () => {
    const missed = withCallFilter({ 'search[inline]': '054' }, 'missed');
    expect(missed).toEqual({ 'search[inline]': '054', 'search[call.cause][IS]': ['no_answer'] });
    expect(activeCallFilter(missed)).toBe('missed');

    const incoming = withCallFilter(missed, 'incoming');
    expect(incoming).toEqual({ 'search[inline]': '054', 'search[call.direction][IS]': ['incoming'] });
    expect(activeCallFilter(incoming)).toBe('incoming');

    expect(withCallFilter(incoming, 'all')).toEqual({ 'search[inline]': '054' });
    expect(activeCallFilter({})).toBe('all');
  });

  it('reads a value that came back through the address bar', () => {
    expect(activeCallFilter({ 'search[call.direction][IS]': 'outgoing' })).toBe('outgoing');
  });
});
