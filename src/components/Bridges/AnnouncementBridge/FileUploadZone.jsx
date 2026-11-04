import React, { useRef, useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  LinearProgress,
  Alert,
  IconButton
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CloudUpload as CloudUploadIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  PlayArrow as PlayIcon
} from '@mui/icons-material';

/**
 * FileUploadZone Component
 * Drag-drop file upload zone with progress tracking
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/views/announcements/new.html (drag-drop zone)
 *
 * Features:
 * - Drag-drop support with visual feedback
 * - Traditional file input fallback
 * - File validation (.mp3, .wav, .ogg, max 10MB)
 * - Upload progress tracking
 * - Visual states: idle, dragover, uploading, success, error
 */
export const FileUploadZone = ({
  onFileSelect,
  acceptedFormats = ['.mp3', '.wav', '.ogg'],
  maxSizeBytes = 10 * 1024 * 1024, // 10MB
  uploadProgress = 0,
  uploadStatus = 'idle', // idle, uploading, success, error
  errorMessage = null,
  disabled = false
}) => {
  const { t } = useTranslation('bridges');
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);

  // Cleanup audio preview URL on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  // Handle drag events
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  // Validate and process file
  const handleFile = (file) => {
    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!acceptedFormats.includes(fileExtension)) {
      onFileSelect(null, t('announcement.file.invalidType', { formats: acceptedFormats.join(', ') }), null);
      return;
    }

    // Validate file size
    if (file.size > maxSizeBytes) {
      const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
      onFileSelect(null, t('announcement.file.tooLarge', { size: maxSizeMB }), null);
      return;
    }

    // File is valid - create preview URL
    setSelectedFileName(file.name);

    // Revoke old URL if exists
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }

    // Create new preview URL for audio playback
    const previewUrl = URL.createObjectURL(file);
    setAudioPreviewUrl(previewUrl);

    // Extract filename without extension for suggested name
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
    // Convert spaces and special chars to underscores
    const suggestedName = nameWithoutExt.replace(/[\s\-.]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

    onFileSelect(file, null, suggestedName);
  };

  // Open file picker
  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Clear selected file
  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedFileName('');
    // Revoke audio preview URL
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
      setAudioPreviewUrl(null);
    }
    onFileSelect(null, null, null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Determine border color based on state
  const getBorderColor = () => {
    if (uploadStatus === 'error') return 'error.main';
    if (uploadStatus === 'success') return 'success.main';
    if (isDragging) return 'primary.main';
    return 'divider';
  };

  // Determine background color based on state
  const getBgColor = () => {
    if (uploadStatus === 'error') return 'error.light';
    if (uploadStatus === 'success') return 'success.light';
    if (isDragging) return 'action.hover';
    return 'background.paper';
  };

  return (
    <Box>
      <Paper
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        sx={{
          border: '2px dashed',
          borderColor: getBorderColor(),
          bgcolor: getBgColor(),
          p: 4,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          opacity: disabled ? 0.6 : 1,
          '&:hover': {
            borderColor: disabled ? getBorderColor() : 'primary.main',
            bgcolor: disabled ? getBgColor() : 'action.hover'
          }
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {/* Icon based on status */}
          {uploadStatus === 'success' ? (
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
          ) : uploadStatus === 'error' ? (
            <ErrorIcon sx={{ fontSize: 64, color: 'error.main' }} />
          ) : uploadStatus === 'uploading' ? (
            <CloudUploadIcon sx={{ fontSize: 64, color: 'primary.main', animation: 'pulse 1.5s infinite' }} />
          ) : (
            <CloudUploadIcon sx={{ fontSize: 64, color: 'action.active' }} />
          )}

          {/* Status text */}
          <Typography variant="h6" textAlign="center">
            {uploadStatus === 'uploading'
              ? t('announcement.file.uploading')
              : uploadStatus === 'success'
              ? t('announcement.file.complete')
              : uploadStatus === 'error'
              ? t('announcement.file.failed')
              : t('announcement.file.drop')}
          </Typography>

          <Typography variant="body2" color="text.secondary" textAlign="center">
            {uploadStatus === 'idle' && t('announcement.file.orClick', { formats: acceptedFormats.join(', '), size: (maxSizeBytes / (1024 * 1024)).toFixed(0) })}
          </Typography>

          {/* Selected file name */}
          {selectedFileName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, maxWidth: '100%', minWidth: 0 }}>
              {/* A long name (no spaces, as file names go) ends in "…"; hover shows it whole. */}
              <Typography variant="body2" fontWeight="medium" noWrap title={selectedFileName} sx={{ minWidth: 0 }}>
                {selectedFileName}
              </Typography>
              {uploadStatus !== 'uploading' && (
                <IconButton size="small" onClick={handleClear} disabled={disabled} sx={{ flexShrink: 0 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats.join(',')}
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            disabled={disabled}
          />
        </Box>
      </Paper>

      {/* Upload progress */}
      {uploadStatus === 'uploading' && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
            {t('announcement.file.progress', { percent: uploadProgress })}
          </Typography>
        </Box>
      )}

      {/* Audio Preview Player */}
      {audioPreviewUrl && uploadStatus !== 'uploading' && (
        <Paper sx={{ p: 2, mt: 2, bgcolor: 'background.default' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <PlayIcon color="primary" />
            <Typography variant="subtitle2" fontWeight="medium">
              {t('announcement.file.preview')}
            </Typography>
          </Box>

          <audio
            controls
            src={audioPreviewUrl}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {t('announcement.file.noAudioSupport')}
          </audio>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {t('announcement.file.previewHint')}
          </Typography>
        </Paper>
      )}

      {/* Error message */}
      {uploadStatus === 'error' && errorMessage && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errorMessage}
        </Alert>
      )}
    </Box>
  );
};

export default FileUploadZone;
