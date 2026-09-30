import { useState, useCallback } from 'react';
import { announcementsApi } from '../../../services/api/announcementsApi.js';

/**
 * useAnnouncement Hook
 * Custom hook for announcement creation (file upload or TTS)
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/scripts/controllers/announcements/new.js
 *
 * Features:
 * - Dual mode support: file upload or TTS
 * - File upload with progress tracking
 * - TTS generation with preview
 * - Form state management
 */
export const useAnnouncement = () => {
  // Mode state
  const [mode, setMode] = useState('file'); // 'file' | 'tts' | 'builtin'

  // File upload state
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error

  // TTS state
  const [ttsText, setTTSText] = useState('');
  const [ttsLanguage, setTTSLanguage] = useState('he'); // Hebrew default for Google TTS
  const [ttsPreviewUrl, setTTSPreviewUrl] = useState(null);
  const [generatingTTS, setGeneratingTTS] = useState(false);

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Suggested name from filename
  const [suggestedName, setSuggestedName] = useState('');

  /**
   * Handle file selection
   * @param {File|null} selectedFile - Selected file
   * @param {string|null} fileError - Error message if any
   * @param {string|null} fileNameSuggestion - Suggested name from filename (spaces converted to underscores)
   */
  const handleFileSelect = useCallback((selectedFile, fileError, fileNameSuggestion) => {
    if (fileError) {
      setError(fileError);
      setFile(null);
      setUploadStatus('error');
      setSuggestedName('');
    } else {
      setFile(selectedFile);
      setError(null);
      setUploadStatus('idle');
      setSuggestedName(fileNameSuggestion || '');
    }
  }, []);

  // TTS path state (stores the path returned from TTS generation)
  const [ttsPath, setTTSPath] = useState('');

  /**
   * Handle TTS generation
   * @param {string} text - Text to convert to speech
   * @param {string} language - Language code
   * @param {string} providerUuid - TTS provider UUID
   */
  const handleTTSGenerate = useCallback(async (text, language, providerUuid) => {
    setGeneratingTTS(true);
    setError(null);

    try {
      const response = await announcementsApi.generateTTS(text, language, providerUuid);

      // API returns { path: "https://api.server.com/tmp/uuid.mp3" }
      const audioUrl = response.path || response.url || response.audio_url;

      if (audioUrl) {
        setTTSPreviewUrl(audioUrl);
        setTTSText(text);
        setTTSLanguage(language);
        // Store the path for creating announcement from TTS
        setTTSPath(audioUrl);
      } else {
        throw new Error('No audio URL in TTS response');
      }
    } catch (err) {
      console.error('Error generating TTS:', err);
      setError(err.message || 'Failed to generate audio');
      setTTSPreviewUrl(null);
    } finally {
      setGeneratingTTS(false);
    }
  }, []);

  /**
   * Save announcement (file upload or TTS)
   */
  const saveAnnouncement = useCallback(async (formData) => {
    setLoading(true);
    setError(null);

    try {
      let result;

      if (mode === 'file') {
        // File upload mode
        if (!file) {
          throw new Error('Please select a file to upload');
        }

        setUploadStatus('uploading');

        result = await announcementsApi.uploadFile(
          formData,
          file,
          (progress) => {
            setUploadProgress(progress);
          }
        );

        setUploadStatus('success');
      } else if (mode === 'builtin') {
        // Built-in (MOH / RINGING / SILENCE): the name decides the audio, the
        // API plays its local file, nothing to upload.
        result = await announcementsApi.createBuiltin(formData);
      } else {
        // TTS mode - use the path from TTS generation
        if (!ttsPath) {
          throw new Error('Please generate audio first using the TTS provider');
        }

        // Create announcement using the path from TTS generation
        // The API accepts a 'path' parameter to create from generated TTS file
        const announcementData = {
          ...formData,
          path: ttsPath
        };

        result = await announcementsApi.createFromTTS(announcementData);
      }

      return result;
    } catch (err) {
      console.error('Error saving announcement:', err);
      setError(err.message || 'Failed to save announcement');

      if (mode === 'file') {
        setUploadStatus('error');
      }

      throw err;
    } finally {
      setLoading(false);
    }
  }, [mode, file, ttsPath]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setMode('file');
    setFile(null);
    setUploadProgress(0);
    setUploadStatus('idle');
    setTTSText('');
    setTTSLanguage('he');
    setTTSPreviewUrl(null);
    setTTSPath('');
    setGeneratingTTS(false);
    setLoading(false);
    setError(null);
    setSuggestedName('');
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Mode
    mode,
    setMode,

    // File upload
    file,
    uploadProgress,
    uploadStatus,
    handleFileSelect,
    suggestedName,  // Suggested name from filename (spaces → underscores)

    // TTS
    ttsText,
    ttsLanguage,
    ttsPreviewUrl,
    generatingTTS,
    handleTTSGenerate,

    // General
    loading,
    error,
    clearError,
    saveAnnouncement,
    reset
  };
};

export default useAnnouncement;
