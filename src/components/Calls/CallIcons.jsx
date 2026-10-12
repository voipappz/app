import React from 'react';
import { Tooltip, IconButton, Box, LinearProgress, Typography } from '@mui/material';
import {
  CallMade,
  CallReceived,
  CheckCircle,
  Cancel,
  PlayArrow,
  Pause,
  Analytics
} from '@mui/icons-material';

export const DirectionIcon = ({ direction }) => {
  const getDirectionIcon = () => {
    switch (direction) {
      case 'outgoing':
        return <CallMade sx={{ color: 'var(--color-success)' }} />;
      case 'incoming':
        return <CallReceived sx={{ color: 'var(--color-info-blue)' }} />;
      default:
        return <CallMade sx={{ color: 'var(--color-neutral)' }} />;
    }
  };

  return (
    <Tooltip title={direction === 'outgoing' ? 'Outgoing Call' : 'Incoming Call'}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {getDirectionIcon()}
      </Box>
    </Tooltip>
  );
};

export const CauseIcon = ({ cause }) => {
  const getCauseIcon = () => {
    switch (cause) {
      case 'answer':
        return <CheckCircle sx={{ color: 'var(--color-success)' }} />;
      case 'no_answer':
        return <Cancel sx={{ color: 'var(--color-danger)' }} />;
      default:
        return <Cancel sx={{ color: 'var(--color-neutral)' }} />;
    }
  };

  return (
    <Tooltip title={cause === 'answer' ? 'Answered' : 'No Answer'}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {getCauseIcon()}
      </Box>
    </Tooltip>
  );
};

// Format seconds to mm:ss
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Global ref: only one recording plays at a time
let _currentlyPlayingAudio = null;

export const RecordingControls = ({ recordingUrl, onOpenCall }) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const audioRef = React.useRef(null);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [recordingUrl]);

  React.useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [recordingUrl]);

  if (!recordingUrl) {
    return (
      <Box sx={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', fontFamily: 'Rubik, sans-serif', fontStyle: 'italic' }}>
        No recording
      </Box>
    );
  }

  const handlePlayPause = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      _currentlyPlayingAudio = null;
    } else {
      if (_currentlyPlayingAudio && _currentlyPlayingAudio !== audio) {
        _currentlyPlayingAudio.pause();
      }
      _currentlyPlayingAudio = audio;

      if (audio.readyState === 0) {
        audio.load();
      }
      audio.play().catch(err => console.error('Play failed:', err));
    }
  };

  const handleProgressClick = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * duration;
    setCurrentTime(audio.currentTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', minWidth: 130 }}>
      <audio ref={audioRef} src={recordingUrl} preload="metadata" />

      <IconButton
        size="small"
        onClick={handlePlayPause}
        aria-label={isPlaying ? "Pause recording" : "Play recording"}
        sx={{
          p: 0.25,
          color: 'var(--accent-primary)',
          '&:hover': {
            backgroundColor: 'var(--accent-primary-alpha-10)',
          },
        }}
      >
        {isPlaying ? <Pause sx={{ fontSize: 18 }} /> : <PlayArrow sx={{ fontSize: 18 }} />}
      </IconButton>

      <Box
        onClick={handleProgressClick}
        sx={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            width: '100%',
            height: 4,
            borderRadius: 2,
            backgroundColor: 'var(--theme-border)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: 'var(--accent-primary)',
              borderRadius: 2,
            },
          }}
        />
      </Box>

      <Typography sx={{
        fontSize: '0.65rem',
        color: 'var(--theme-text-secondary)',
        fontFamily: 'var(--font-family)',
        minWidth: 32,
        textAlign: 'right',
      }}>
        {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
      </Typography>

      <Tooltip title="Open call details">
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onOpenCall?.(); }}
          sx={{ p: 0.25, color: 'var(--accent-primary)', '&:hover': { backgroundColor: 'var(--accent-primary-alpha-10)' } }}
        >
          <Analytics sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
