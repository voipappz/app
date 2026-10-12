import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';
import AudioPreview from './AudioPreview';
import { getAnnouncement } from '../../../services/api/announcementsApi';

vi.mock('../../../services/api/announcementsApi', () => ({ getAnnouncement: vi.fn() }));

// jsdom has no media playback: play/pause just fire the events a browser would.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play() {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause() {
    this.dispatchEvent(new Event('pause'));
  });
});
afterEach(() => { vi.restoreAllMocks(); getAnnouncement.mockReset(); return i18n.changeLanguage('en'); });

describe('AudioPreview', () => {
  it('downloads nothing until it is tapped', () => {
    render(<AudioPreview uuid="a1" />);
    expect(getAnnouncement).not.toHaveBeenCalled();
    expect(document.querySelector('audio').getAttribute('src')).toBeNull();
  });

  it('plays and pauses', async () => {
    render(<AudioPreview src="https://files.example/a1.wav" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play announcement' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(document.querySelector('audio').src).toBe('https://files.example/a1.wav');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByRole('button', { name: 'Play announcement' })).toBeInTheDocument();
  });

  it('looks the file up by announcement when it has no address', async () => {
    getAnnouncement.mockResolvedValue({ data: { uuid: 'a1', path: 'https://files.example/a1.wav' } });
    render(<AudioPreview uuid="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play announcement' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(getAnnouncement).toHaveBeenCalledWith('a1');
  });

  it('pauses the other preview when one starts', async () => {
    render(
      <>
        <AudioPreview src="https://files.example/one.wav" />
        <AudioPreview src="https://files.example/two.wav" />
      </>,
    );
    const [first, second] = screen.getAllByRole('button', { name: 'Play announcement' });
    fireEvent.click(first);
    await screen.findByRole('button', { name: 'Pause' });
    fireEvent.click(second);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(1));
    expect(screen.getAllByRole('button', { name: 'Play announcement' })).toHaveLength(1);
  });

  it('says so when the announcement has no audio', async () => {
    getAnnouncement.mockResolvedValue({ uuid: 'a1' });
    render(<AudioPreview uuid="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play announcement' }));
    expect(await screen.findByText('Audio unavailable')).toBeInTheDocument();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<AudioPreview src="https://files.example/a1.wav" />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('audio.play', { ns: 'bridges' }) }));
    expect(await screen.findByRole('button', { name: i18n.t('audio.pause', { ns: 'bridges' }) })).toBeInTheDocument();
    expect(i18n.t('audio.play', { ns: 'bridges' })).not.toBe('Play announcement');
  });
});
