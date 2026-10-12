import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  RecordVoiceOver as TTSIcon,
  PlayArrow as PlayIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { announcementsApi } from '../../../services/api/announcementsApi.js';

/**
 * TTSGenerator Component
 * Text-to-speech audio generator for announcements
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/views/announcements/new.html (TTS section)
 * - /opt/src/va-voipbox-admin/src/scripts/controllers/announcements/new.js (generateFile function)
 *
 * Features:
 * - TTS Provider selection (required - Google Cloud TTS)
 * - Text input with character limit
 * - Language selection
 * - Audio generation and preview
 * - Visual feedback for generation status
 */
export const TTSGenerator = ({
  onGenerate,
  previewUrl = null,
  generating = false,
  error = null,
  maxLength = 500,
  disabled = false
}) => {
  const { t } = useTranslation('bridges');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('he-IL'); // Hebrew default for Google TTS (must match option value)
  const [providerUuid, setProviderUuid] = useState('');
  const [ttsProviders, setTTSProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Fetch TTS providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      setLoadingProviders(true);
      try {
        const providers = await announcementsApi.getTTSProviders();
        setTTSProviders(providers);
        // Auto-select first provider if only one available
        if (providers.length === 1) {
          setProviderUuid(providers[0].uuid);
        }
      } catch (err) {
        console.error('Error fetching TTS providers:', err);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
  }, []);

  // Available languages for Google TTS
  const languages = [
    { code: 'he-IL', name: t('announcement.tts.languages.he-IL') },
    { code: 'en-US', name: t('announcement.tts.languages.en-US') },
    { code: 'en-GB', name: t('announcement.tts.languages.en-GB') },
    { code: 'es-ES', name: t('announcement.tts.languages.es-ES') },
    { code: 'fr-FR', name: t('announcement.tts.languages.fr-FR') },
    { code: 'de-DE', name: t('announcement.tts.languages.de-DE') },
    { code: 'it-IT', name: t('announcement.tts.languages.it-IT') },
    { code: 'pt-BR', name: t('announcement.tts.languages.pt-BR') },
    { code: 'ar-XA', name: t('announcement.tts.languages.ar-XA') },
    { code: 'ru-RU', name: t('announcement.tts.languages.ru-RU') },
    { code: 'zh-CN', name: t('announcement.tts.languages.zh-CN') },
    { code: 'ja-JP', name: t('announcement.tts.languages.ja-JP') }
  ];

  // Handle generate button click
  const handleGenerate = () => {
    if (!text.trim() || !providerUuid) {
      return;
    }

    onGenerate(text.trim(), language, providerUuid);
  };

  // Check if generate button should be disabled
  const isGenerateDisabled = disabled || generating || !text.trim() || text.length > maxLength || !providerUuid;

  return (
    <Box>
      {/* No TTS Providers Warning */}
      {!loadingProviders && ttsProviders.length === 0 && (
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>{t('announcement.tts.noProviders')}</strong> {t('announcement.tts.noProvidersHint')}
          </Typography>
        </Alert>
      )}

      {/* TTS Provider Selection */}
      <FormControl fullWidth sx={{ mb: 2 }} disabled={disabled || generating || loadingProviders} required>
        <InputLabel>{t('announcement.tts.provider')}</InputLabel>
        <Select
          value={providerUuid}
          onChange={(e) => setProviderUuid(e.target.value)}
          label={t('announcement.tts.provider')}
        >
          {loadingProviders ? (
            <MenuItem disabled>{t('announcement.tts.loadingProviders')}</MenuItem>
          ) : ttsProviders.length === 0 ? (
            <MenuItem disabled>{t('announcement.tts.noneAvailable')}</MenuItem>
          ) : (
            ttsProviders.map((provider) => (
              <MenuItem key={provider.uuid} value={provider.uuid}>
                {provider.name}
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>

      {/* Text Input */}
      <TextField
        label={t('announcement.tts.text')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        rows={4}
        fullWidth
        required
        disabled={disabled || generating || ttsProviders.length === 0}
        placeholder={t('announcement.tts.textPlaceholder')}
        helperText={t('announcement.tts.characters', { used: text.length, max: maxLength })}
        error={text.length > maxLength}
        sx={{ mb: 2 }}
      />

      {/* Language Selection */}
      <FormControl fullWidth sx={{ mb: 2 }} disabled={disabled || generating || ttsProviders.length === 0}>
        <InputLabel>{t('announcement.tts.language')}</InputLabel>
        <Select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          label={t('announcement.tts.language')}
        >
          {languages.map((lang) => (
            <MenuItem key={lang.code} value={lang.code}>
              {lang.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Generate Button */}
      <Button
        variant="contained"
        onClick={handleGenerate}
        disabled={isGenerateDisabled || ttsProviders.length === 0}
        fullWidth
        startIcon={generating ? <CircularProgress size={20} /> : <TTSIcon />}
        sx={{ mb: 2 }}
      >
        {generating ? t('announcement.tts.generating') : t('announcement.tts.generate')}
      </Button>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Audio Preview */}
      {previewUrl && !generating && (
        <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <PlayIcon color="primary" />
            <Typography variant="subtitle2" fontWeight="medium">
              {t('announcement.file.preview')}
            </Typography>
          </Box>

          <audio
            controls
            src={previewUrl}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {t('announcement.file.noAudioSupport')}
          </audio>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {t('announcement.tts.previewHint')}
          </Typography>
        </Paper>
      )}

      {/* Info Box */}
      {!previewUrl && !generating && ttsProviders.length > 0 && (
        <Alert severity="info" icon={<TTSIcon />}>
          <Typography variant="body2">
            {t('announcement.tts.info', { button: t('announcement.tts.generate') })}
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default TTSGenerator;
