import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Multer configured for file uploads if needed in the future

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Download audio file from URL
async function downloadAudio(audioUrl) {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }
    return await response.buffer();
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`, { cause: error });
  }
}

// Transcribe audio using OpenAI Whisper
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioUrl } = req.body;
    
    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio URL is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log('Downloading audio from:', audioUrl);
    const audioBuffer = await downloadAudio(audioUrl);
    
    console.log('Audio downloaded, size:', audioBuffer.length, 'bytes');
    
    // Create form data for OpenAI API
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'recording.wav',
      contentType: 'audio/wav'
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    console.log('Sending to OpenAI Whisper API...');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Transcription failed: ${response.statusText}`,
        details: errorText
      });
    }

    const result = await response.json();
    console.log('Transcription successful, language:', result.language);
    
    res.json({
      text: result.text,
      language: result.language
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Translate text using OpenAI GPT
app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLanguage } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!sourceLanguage) {
      return res.status(400).json({ error: 'Source language is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log('Translating text from', sourceLanguage, 'to English');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-40-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the given text to English while preserving the original meaning and context. Only respond with the translation, no additional text.'
          },
          {
            role: 'user',
            content: `Translate this ${getLanguageName(sourceLanguage)} text to English: "${text}"`
          }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Translation failed: ${response.statusText}`,
        details: errorText
      });
    }

    const result = await response.json();
    const translation = result.choices[0]?.message?.content?.trim();
    
    console.log('Translation successful');
    
    res.json({ translation });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Generate call summary and satisfaction rating
async function generateCallSummaryAndRating(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert call analyst. Analyze the following call transcript and provide:
1. A concise one-paragraph summary of what happened in the call
2. A customer satisfaction rating from 1-5 (1=very dissatisfied, 5=very satisfied) based on the customer's tone, language, and overall interaction

Respond with a JSON object in this exact format:
{
  "summary": "One paragraph summary here...",
  "satisfactionRating": 4
}

Consider factors like:
- Customer's tone and language
- Whether their issue was resolved
- How polite/frustrated they seemed
- Overall interaction quality`
          },
          {
            role: 'user',
            content: `Analyze this call transcript: "${text}"`
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content?.trim();
    
    try {
      return JSON.parse(content);
    } catch (_parseError) { // eslint-disable-line no-unused-vars, @typescript-eslint/no-unused-vars
      // Fallback if JSON parsing fails
      return {
        summary: "Unable to generate summary - please view full transcript for details.",
        satisfactionRating: 3
      };
    }
  } catch (error) {
    console.error('Error generating summary and rating:', error);
    return {
      summary: "Unable to generate summary - please view full transcript for details.",
      satisfactionRating: 3
    };
  }
}

// Combined endpoint for full analysis (transcribe + translate + summarize)
app.post('/api/analyze-recording', async (req, res) => {
  try {
    const { audioUrl, callId } = req.body;
    
    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio URL is required' });
    }

    console.log('Starting full analysis for call:', callId);
    
    // Step 1: Transcribe
    const transcribeResponse = await fetch(`http://localhost:${PORT}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl })
    });
    
    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.json();
      return res.status(transcribeResponse.status).json(error);
    }
    
    const transcriptionResult = await transcribeResponse.json();
    
    // Step 2: Translate if not English
    let translation = null;
    let textForAnalysis = transcriptionResult.text;
    
    if (transcriptionResult.language !== 'en') {
      console.log('Text is not in English, translating...');
      
      const translateResponse = await fetch(`http://localhost:${PORT}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: transcriptionResult.text, 
          sourceLanguage: transcriptionResult.language 
        })
      });
      
      if (translateResponse.ok) {
        const translateResult = await translateResponse.json();
        translation = translateResult.translation;
        textForAnalysis = translation; // Use translation for analysis
      } else {
        console.warn('Translation failed, using original text for analysis');
      }
    }

    // Step 3: Generate summary and satisfaction rating
    console.log('Generating call summary and satisfaction rating...');
    const analysisResult = await generateCallSummaryAndRating(textForAnalysis);

    const result = {
      originalText: transcriptionResult.text,
      detectedLanguage: transcriptionResult.language,
      languageName: getLanguageName(transcriptionResult.language),
      translation: translation,
      summary: analysisResult.summary,
      satisfactionRating: analysisResult.satisfactionRating,
      timestamp: new Date().toISOString(),
      callId: callId
    };

    console.log('Analysis complete for call:', callId);
    res.json(result);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Helper function to get language name
function getLanguageName(languageCode) {
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

// Error handling middleware
app.use((error, req, res, _next) => {  
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Catch-all route to serve the React app
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Recording Analysis Server running on http://localhost:${PORT}`);
  console.log(`📡 CORS enabled for frontend development servers`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`🌐 Serving React app from ${path.join(__dirname, 'dist')}`);
});