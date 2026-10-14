import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, LinearProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { PlayArrow as PlayIcon, Pause as PauseIcon } from '@mui/icons-material';
import { getAnnouncement } from '../../../services/api/announcementsApi';

// The preview playing right now. Starting another one pauses it, so two
// announcements never talk over each other.
let playing = null;

const clock = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// The announcement's file address: `path` (or `url`) on the announcement
// itself. Without it, the announcement is fetched on the first play only.
const audioAddress = async (uuid) => {
  const response = await getAnnouncement(uuid);
  const announcement = response?.data?.uuid ? response.data : response;
  return announcement?.path || announcement?.url || null;
};

/**
 * A small inline player for an announcement: play/pause, progress, time.
 * Nothing downloads until the first tap.
 *
 * @param {string} src - The audio address, when the caller already has it.
 * @param {string} uuid - The announcement, to look the address up when `src` is missing.
 * @param {string} playLabel - What the play button says, when it is not an announcement.
 */
export default function AudioPreview({ src, uuid, playLabel }) {
  const { t } = useTranslation('bridges');
  const audioRef = useRef(null);
  const [address, setAddress] = useState(src || null);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | paused | error
  const [time, setTime] = useState({ current: 0, total: 0 });

  // Leaving the screen stops the sound.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (playing === audio) playing = null;
      audio?.pause();
    };
  }, []);

  const start = async (audio) => {
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    try {
      await audio.play();
    } catch {
      setStatus('error');
    }
  };

  const toggle = async (event) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (status === 'playing') {
      audio.pause();
      return;
    }
    if (audio.src) {
      start(audio);
      return;
    }
    setStatus('loading');
    try {
      const found = address || (uuid ? await audioAddress(uuid) : null);
      if (!found) throw new Error('No audio');
      setAddress(found);
      audio.src = found;
      start(audio);
    } catch {
      setStatus('error');
    }
  };

  if (status === 'error') {
    return <Typography variant="caption" color="text.secondary" data-testid="audio-preview-error">{t('audio.unavailable')}</Typography>;
  }

  const progress = time.total ? (time.current / time.total) * 100 : 0;

  return (
    <Box data-testid="audio-preview" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }} onClick={(event) => event.stopPropagation()}>
      <IconButton
        onClick={toggle}
        aria-label={status === 'playing' ? t('audio.pause') : (playLabel || t('audio.play'))}
        color="primary"
        sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: 'action.hover' }}
      >
        {status === 'loading' ? <CircularProgress size={20} /> : status === 'playing' ? <PauseIcon /> : <PlayIcon />}
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1 }} aria-hidden />
        <Typography variant="caption" color="text.secondary" component="div" dir="ltr" sx={{ textAlign: 'end', mt: 0.25 }}>
          {clock(time.current)} / {clock(time.total)}
        </Typography>
      </Box>
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setStatus('playing')}
        onPause={() => setStatus('paused')}
        onEnded={() => { setStatus('paused'); setTime((prev) => ({ ...prev, current: 0 })); }}
        onError={() => { if (audioRef.current?.src) setStatus('error'); }}
        onLoadedMetadata={(event) => setTime((prev) => ({ ...prev, total: event.currentTarget.duration }))}
        onTimeUpdate={(event) => setTime({ current: event.currentTarget.currentTime, total: event.currentTarget.duration })}
      />
    </Box>
  );
}
