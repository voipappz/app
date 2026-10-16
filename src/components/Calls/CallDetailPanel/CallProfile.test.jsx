import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CallProfile, { profileRows } from './CallProfile.jsx';

const profile = {
  direction: 'incoming', cause: 'answer', state: 'hangup', disposition: 'recv_bye',
  duration: '125', talk_duration: '118', caller: '0501234567', callee: '1001',
  did_name: 'Main line', provider_name: 'Carrier A', sip_call_id: 'abc-123@10.0.0.1',
  codecs: 'PCMA', rtp_audio_in_mos: '4.41', custom_flag: 'yes',
  empty_one: '', nothing: null, _recording_url: 'https://x/rec.wav', smtp_password: 'secret',
};

describe('CallProfile', () => {
  it('lists the profile fields with human labels, durations as m:ss, ids copyable', () => {
    render(<CallProfile profile={profile} />);
    const list = screen.getByTestId('call-profile');
    expect(within(list).getByText('Call profile')).toBeInTheDocument();
    expect(within(list).getByText('Route')).toBeInTheDocument();
    expect(within(list).getByText('Main line')).toBeInTheDocument();
    expect(within(list).getByText('Duration')).toBeInTheDocument();
    expect(within(list).getByText('2:05')).toBeInTheDocument();
    expect(within(list).getByText('MOS')).toBeInTheDocument();
    expect(within(list).getByText('SIP Call-ID')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Copy SIP Call-ID' })).toBeInTheDocument();
    // An unknown key keeps its raw name.
    expect(within(list).getByText('custom_flag')).toBeInTheDocument();
  });

  it('leaves out empty values, internal keys, credentials and what the panel already shows', () => {
    const keys = profileRows(profile).map((row) => row.key);
    expect(keys).not.toEqual(expect.arrayContaining(['empty_one']));
    ['empty_one', 'nothing', '_recording_url', 'smtp_password', 'direction', 'cause', 'talk_duration']
      .forEach((key) => expect(keys).not.toContain(key));
    // Known keys first, in reading order; unknown keys after.
    expect(keys.indexOf('state')).toBeLessThan(keys.indexOf('custom_flag'));
    expect(keys[keys.length - 1]).toBe('custom_flag');
  });

  it('renders nothing for a call without a profile', () => {
    const { container } = render(<CallProfile profile={{ cause: 'answer', empty: '' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
