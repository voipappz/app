class RecordingAnalysisService {
  constructor() {
    this.baseUrl = import.meta.env.VITE_ANALIZE_API_BASE_URL+'/api';
    this.storagePrefix = 'recording_analysis_';
  }

  async analyzeRecording(audioUrl, callId) {
    // Check if we already have cached results
    const cached = this.getCachedAnalysis(callId);
    if (cached) {
      return cached;
    }

    try {
      // Use the backend API for analysis
      const response = await fetch(`${this.baseUrl}/analyze-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audioUrl: audioUrl,
          callId: callId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Server error: ${response.statusText}`);
      }

      const result = await response.json();

      // Cache the results
      this.cacheAnalysis(callId, result);
      
      return result;
    } catch (error) {
      console.error('Error analyzing recording:', error);
      throw new Error(`Failed to analyze recording: ${error.message}`, { cause: error });
    }
  }


  getCachedAnalysis(callId) {
    try {
      const cached = localStorage.getItem(`${this.storagePrefix}${callId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error reading cached analysis:', error);
      return null;
    }
  }

  cacheAnalysis(callId, analysis) {
    try {
      localStorage.setItem(`${this.storagePrefix}${callId}`, JSON.stringify(analysis));
    } catch (error) {
      console.error('Error caching analysis:', error);
    }
  }

  clearCache(callId = null) {
    if (callId) {
      localStorage.removeItem(`${this.storagePrefix}${callId}`);
    } else {
      // Clear all cached analyses
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(this.storagePrefix)) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  getLanguageName(languageCode) {
    const languages = {
      'af': 'Afrikaans',
      'ar': 'Arabic',
      'hy': 'Armenian',
      'az': 'Azerbaijani',
      'be': 'Belarusian',
      'bs': 'Bosnian',
      'bg': 'Bulgarian',
      'ca': 'Catalan',
      'zh': 'Chinese',
      'hr': 'Croatian',
      'cs': 'Czech',
      'da': 'Danish',
      'nl': 'Dutch',
      'en': 'English',
      'et': 'Estonian',
      'fi': 'Finnish',
      'fr': 'French',
      'gl': 'Galician',
      'de': 'German',
      'el': 'Greek',
      'he': 'Hebrew',
      'hi': 'Hindi',
      'hu': 'Hungarian',
      'is': 'Icelandic',
      'id': 'Indonesian',
      'it': 'Italian',
      'ja': 'Japanese',
      'kn': 'Kannada',
      'kk': 'Kazakh',
      'ko': 'Korean',
      'lv': 'Latvian',
      'lt': 'Lithuanian',
      'mk': 'Macedonian',
      'ms': 'Malay',
      'mr': 'Marathi',
      'mi': 'Maori',
      'ne': 'Nepali',
      'no': 'Norwegian',
      'fa': 'Persian',
      'pl': 'Polish',
      'pt': 'Portuguese',
      'ro': 'Romanian',
      'ru': 'Russian',
      'sr': 'Serbian',
      'sk': 'Slovak',
      'sl': 'Slovenian',
      'es': 'Spanish',
      'sw': 'Swahili',
      'sv': 'Swedish',
      'tl': 'Tagalog',
      'ta': 'Tamil',
      'th': 'Thai',
      'tr': 'Turkish',
      'uk': 'Ukrainian',
      'ur': 'Urdu',
      'vi': 'Vietnamese',
      'cy': 'Welsh'
    };
    
    return languages[languageCode] || languageCode.toUpperCase();
  }
}

export default new RecordingAnalysisService();