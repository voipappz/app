import { describe, expect, it } from 'vitest';
import {
  parseReferNotify, reduceTransferState, sipTargetAddress,
  type TransferInfo,
} from './transfer';

describe('sipTargetAddress', () => {
  it('qualifies a bare extension with the registered domain', () => {
    expect(sipTargetAddress('204', 'pbx.example')).toBe('sip:204@pbx.example');
  });

  it('strips dial-pad formatting that would make the URI invalid', () => {
    expect(sipTargetAddress(' 03-555 1234 ', 'pbx.example')).toBe('sip:035551234@pbx.example');
    expect(sipTargetAddress('(072) 210-0000', 'pbx.example')).toBe('sip:0722100000@pbx.example');
  });

  it('keeps an explicit host over the registered domain', () => {
    expect(sipTargetAddress('204@other.example', 'pbx.example')).toBe('sip:204@other.example');
  });

  it('keeps dots in an alphanumeric user part', () => {
    expect(sipTargetAddress('john.doe@pbx.example', 'other.example')).toBe('sip:john.doe@pbx.example');
  });

  it('passes a ready-made URI through', () => {
    expect(sipTargetAddress('sip:204@pbx.example', 'ignored')).toBe('sip:204@pbx.example');
    expect(sipTargetAddress('SIPS:204@pbx.example', 'ignored')).toBe('SIPS:204@pbx.example');
  });

  it('preserves a + prefix for international dialling', () => {
    expect(sipTargetAddress('+972501234567', 'pbx.example')).toBe('sip:+972501234567@pbx.example');
  });

  it('returns null when there is nothing dialable', () => {
    expect(sipTargetAddress('', 'pbx.example')).toBeNull();
    expect(sipTargetAddress('   ', 'pbx.example')).toBeNull();
    expect(sipTargetAddress('- -', 'pbx.example')).toBeNull();
    // No domain configured and none supplied — makeURI would reject this anyway.
    expect(sipTargetAddress('204', '')).toBeNull();
  });
});

describe('parseReferNotify', () => {
  it('reads a final success sipfrag', () => {
    expect(parseReferNotify('SIP/2.0 200 OK')).toEqual({ code: 200, reason: 'OK', final: true, success: true });
  });

  it('treats 1xx as still in progress', () => {
    expect(parseReferNotify('SIP/2.0 100 Trying')).toMatchObject({ code: 100, final: false, success: false });
    expect(parseReferNotify('SIP/2.0 180 Ringing')).toMatchObject({ code: 180, final: false, success: false });
  });

  it('treats a final non-2xx as a failure', () => {
    expect(parseReferNotify('SIP/2.0 486 Busy Here')).toEqual({ code: 486, reason: 'Busy Here', final: true, success: false });
    expect(parseReferNotify('SIP/2.0 603 Decline')).toMatchObject({ code: 603, final: true, success: false });
  });

  it('tolerates a leading CRLF and trailing headers', () => {
    expect(parseReferNotify('\r\nSIP/2.0 200 OK\r\nContact: <sip:a@b>\r\n')).toMatchObject({ code: 200, success: true });
  });

  it('reports nothing final for an unparseable or missing body', () => {
    expect(parseReferNotify(undefined)).toEqual({ code: null, reason: '', final: false, success: false });
    expect(parseReferNotify('')).toMatchObject({ code: null, final: false });
    expect(parseReferNotify('not a sipfrag')).toMatchObject({ code: null, final: false });
  });
});

describe('reduceTransferState', () => {
  const referring: TransferInfo = { kind: 'blind', target: '204', phase: 'referring' };

  it('follows a blind transfer from REFER to completed and cleared', () => {
    let state = reduceTransferState(null, { type: 'refer', kind: 'blind', target: '204' });
    expect(state).toEqual({ kind: 'blind', target: '204', phase: 'referring' });
    state = reduceTransferState(state, { type: 'progress', code: 100 });
    expect(state).toMatchObject({ phase: 'referring', code: 100 });
    state = reduceTransferState(state, { type: 'completed' });
    expect(state?.phase).toBe('completed');
    expect(reduceTransferState(state, { type: 'clear' })).toBeNull();
  });

  it('follows an attended transfer from consultation to REFER', () => {
    let state = reduceTransferState(null, { type: 'consult', target: '204' });
    expect(state).toEqual({ kind: 'attended', target: '204', phase: 'consulting' });
    state = reduceTransferState(state, { type: 'refer', kind: 'attended', target: '204' });
    expect(state?.phase).toBe('referring');
  });

  it('records the reason on failure', () => {
    const failed = reduceTransferState(referring, { type: 'failed', reason: '486 Busy Here' });
    expect(failed).toMatchObject({ phase: 'failed', reason: '486 Busy Here' });
  });

  it('refuses a second REFER while one is unresolved', () => {
    expect(reduceTransferState(referring, { type: 'refer', kind: 'blind', target: '999' })).toEqual(referring);
  });

  it('refuses a consultation while a transfer is pending', () => {
    expect(reduceTransferState(referring, { type: 'consult', target: '999' })).toEqual(referring);
    const consulting: TransferInfo = { kind: 'attended', target: '204', phase: 'consulting' };
    expect(reduceTransferState(consulting, { type: 'consult', target: '999' })).toEqual(consulting);
  });

  it('allows a fresh transfer once the previous one is over', () => {
    const failed: TransferInfo = { ...referring, phase: 'failed', reason: 'nope' };
    expect(reduceTransferState(failed, { type: 'consult', target: '999' }))
      .toEqual({ kind: 'attended', target: '999', phase: 'consulting' });
  });

  it('ignores outcomes that arrive without a REFER in flight', () => {
    const consulting: TransferInfo = { kind: 'attended', target: '204', phase: 'consulting' };
    expect(reduceTransferState(consulting, { type: 'completed' })).toEqual(consulting);
    expect(reduceTransferState(consulting, { type: 'progress', code: 200 })).toEqual(consulting);
    expect(reduceTransferState(null, { type: 'completed' })).toBeNull();
    expect(reduceTransferState(null, { type: 'progress', code: 200 })).toBeNull();
  });

  it('does not let a late NOTIFY overwrite a settled transfer', () => {
    const completed: TransferInfo = { ...referring, phase: 'completed' };
    expect(reduceTransferState(completed, { type: 'failed', reason: 'late' })).toEqual(completed);
    const failed: TransferInfo = { ...referring, phase: 'failed', reason: 'first' };
    expect(reduceTransferState(failed, { type: 'completed' })).toEqual(failed);
  });

  it('does not clear a transfer that is still running', () => {
    expect(reduceTransferState(referring, { type: 'clear' })).toEqual(referring);
    const consulting: TransferInfo = { kind: 'attended', target: '204', phase: 'consulting' };
    expect(reduceTransferState(consulting, { type: 'clear' })).toEqual(consulting);
  });

  it('cancel drops the transfer from any phase', () => {
    expect(reduceTransferState(referring, { type: 'cancel' })).toBeNull();
    expect(reduceTransferState(null, { type: 'cancel' })).toBeNull();
  });
});
