import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../../i18n/LtrIsland';
import { Box, CircularProgress, Typography } from '@mui/material';
import * as luaparse from 'luaparse';
import {
  sessionMethods,
  freeswitchGlobals,
  luaStdlib,
  commonPatterns,
  hoverDocs
} from './luaFreeSwitchCompletions.js';

// Track whether we've already registered providers (Monaco is a singleton)
let providersRegistered = false;

/**
 * Register FreeSWitch Lua IntelliSense and custom theme with Monaco.
 * Called once via beforeMount.
 */
function setupMonaco(monaco) {
  if (providersRegistered) return;
  providersRegistered = true;

  // --- Custom freeswitch-dark theme ---
  monaco.editor.defineTheme('freeswitch-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: '6EDB8A' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'delimiter', foreground: 'D4D4D4' }
    ],
    colors: {
      'editor.background': '#1A1D23',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#22262E',
      'editorCursor.foreground': '#AEAFAD',
      'editor.selectionBackground': '#264F78',
      'editorLineNumber.foreground': '#505662',
      'editorLineNumber.activeForeground': '#9CDCFE'
    }
  });

  // --- Completion provider for Lua ---
  monaco.languages.registerCompletionItemProvider('lua', {
    triggerCharacters: ['.', ':'],
    provideCompletionItems(model, position) {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const wordRange = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      };

      const suggestions = [];

      // After "session:" or "session."
      if (/session[.:]$/.test(textUntilPosition)) {
        sessionMethods.forEach(m => {
          suggestions.push({
            label: m.label,
            kind: monaco.languages.CompletionItemKind.Method,
            detail: m.detail,
            documentation: { value: m.doc },
            insertText: m.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: wordRange
          });
        });
        return { suggestions };
      }

      // After "freeswitch."
      if (/freeswitch\.$/.test(textUntilPosition)) {
        freeswitchGlobals.forEach(m => {
          suggestions.push({
            label: m.label,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: m.detail,
            documentation: { value: m.doc },
            insertText: m.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: wordRange
          });
        });
        return { suggestions };
      }

      // After "event:" or "api:"
      if (/event[.:]$/.test(textUntilPosition)) {
        const eventMethods = commonPatterns.filter(m =>
          m.label.startsWith('event:')
        );
        eventMethods.forEach(m => {
          suggestions.push({
            label: m.label.replace('event:', ''),
            kind: monaco.languages.CompletionItemKind.Method,
            detail: m.detail,
            documentation: { value: m.doc },
            insertText: m.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: wordRange
          });
        });
        return { suggestions };
      }

      if (/api[.:]$/.test(textUntilPosition)) {
        const apiMethodItem = commonPatterns.find(m => m.label === 'api:execute');
        if (apiMethodItem) {
          suggestions.push({
            label: 'execute',
            kind: monaco.languages.CompletionItemKind.Method,
            detail: apiMethodItem.detail,
            documentation: { value: apiMethodItem.doc },
            insertText: apiMethodItem.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: wordRange
          });
        }
        return { suggestions };
      }

      // General completions (Lua stdlib + common patterns)
      luaStdlib.forEach(m => {
        const kind = m.kind === 'Keyword'
          ? monaco.languages.CompletionItemKind.Keyword
          : monaco.languages.CompletionItemKind.Function;
        suggestions.push({
          label: m.label,
          kind,
          detail: m.detail,
          documentation: { value: m.doc },
          insertText: m.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: wordRange
        });
      });

      commonPatterns.forEach(m => {
        suggestions.push({
          label: m.label,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: m.detail,
          documentation: { value: m.doc },
          insertText: m.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: wordRange
        });
      });

      // Also surface session and freeswitch as top-level suggestions
      suggestions.push({
        label: 'session',
        kind: monaco.languages.CompletionItemKind.Variable,
        detail: 'FreeSWitch session object',
        documentation: { value: 'The session object — type "session:" to see available methods.' },
        insertText: 'session',
        range: wordRange
      });
      suggestions.push({
        label: 'freeswitch',
        kind: monaco.languages.CompletionItemKind.Module,
        detail: 'FreeSWitch global module',
        documentation: { value: 'The freeswitch global — type "freeswitch." to see available functions.' },
        insertText: 'freeswitch',
        range: wordRange
      });

      return { suggestions };
    }
  });

  // --- Hover provider for Lua ---
  monaco.languages.registerHoverProvider('lua', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const lineContent = model.getLineContent(position.lineNumber);
      const col = position.column;

      // Try to match "session:method" or "freeswitch.func"
      const prefixes = ['session:', 'session.', 'freeswitch.'];
      for (const prefix of prefixes) {
        const idx = lineContent.lastIndexOf(prefix, col);
        if (idx >= 0) {
          const key = prefix + word.word;
          const entry = hoverDocs[key];
          if (entry) {
            return {
              range: new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn
              ),
              contents: [
                { value: `**${entry.signature}**` },
                { value: entry.description }
              ]
            };
          }
        }
      }

      // Try standalone function match
      const entry = hoverDocs[word.word];
      if (entry) {
        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          ),
          contents: [
            { value: `**${entry.signature}**` },
            { value: entry.description }
          ]
        };
      }

      return null;
    }
  });
}

/**
 * Run luaparse on code and return syntax errors as Monaco markers.
 */
function checkLuaSyntax(code, monaco) {
  if (!code || !code.trim()) return [];
  try {
    luaparse.parse(code, {
      luaVersion: '5.1',
      comments: true,
      scope: false,
      wait: false
    });
    return []; // no errors
  } catch (err) {
    if (err.line !== undefined && err.column !== undefined) {
      return [{
        severity: monaco.MarkerSeverity.Error,
        message: err.message.replace(/^\[\d+:\d+\]\s*/, ''),
        startLineNumber: err.line,
        startColumn: err.column,
        endLineNumber: err.line,
        endColumn: err.column + 1
      }];
    }
    return [];
  }
}

/**
 * CodeEditor Component
 * Monaco Editor wrapper with FreeSWitch Lua IntelliSense, syntax checking, custom theme, and status bar.
 */
export const CodeEditor = ({
  value = '',
  onChange,
  onEditorMount,
  language = 'lua',
  height = '500px',
  theme = 'freeswitch-dark',
  readOnly = false,
  fullscreen = false,
  options = {}
}) => {
  const { t } = useTranslation('bridges');
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [syntaxErrors, setSyntaxErrors] = useState(0);
  const editorInstanceRef = useRef(null);
  const monacoRef = useRef(null);
  const lintTimerRef = useRef(null);

  const handleEditorChange = useCallback((newValue) => {
    if (onChange) {
      onChange(newValue || '');
    }
  }, [onChange]);

  // Debounced Lua lint — runs 500ms after user stops typing
  useEffect(() => {
    if (language !== 'lua' || !monacoRef.current || !editorInstanceRef.current) return;
    clearTimeout(lintTimerRef.current);
    lintTimerRef.current = setTimeout(() => {
      const monaco = monacoRef.current;
      const model = editorInstanceRef.current.getModel();
      if (!model) return;
      const markers = checkLuaSyntax(value, monaco);
      monaco.editor.setModelMarkers(model, 'luaparse', markers);
      setSyntaxErrors(markers.length);
    }, 500);
    return () => clearTimeout(lintTimerRef.current);
  }, [value, language]);

  const handleBeforeMount = useCallback((monaco) => {
    setupMonaco(monaco);
  }, []);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorInstanceRef.current = editor;
    monacoRef.current = monaco;

    // Track cursor position for status bar
    editor.onDidChangeCursorPosition((e) => {
      setCursorInfo({ line: e.position.lineNumber, col: e.position.column });
    });

    // Run initial lint
    if (language === 'lua') {
      const markers = checkLuaSyntax(editor.getValue(), monaco);
      monaco.editor.setModelMarkers(editor.getModel(), 'luaparse', markers);
      setSyntaxErrors(markers.length);
    }

    if (onEditorMount) {
      onEditorMount(editor, monaco);
    }
  }, [onEditorMount, language]);

  const LoadingComponent = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: height,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1
      }}
    >
      <CircularProgress />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {t('vml.editor.loading')}
      </Typography>
    </Box>
  );

  const defaultOptions = {
    minimap: { enabled: true },
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    lineNumbers: 'on',
    folding: true,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    readOnly: readOnly,
    tabSize: 2,
    insertSpaces: true,
    renderWhitespace: 'selection',
    formatOnPaste: true,
    formatOnType: true,
    bracketPairColorization: { enabled: true },
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    matchBrackets: 'always',
    renderLineHighlight: 'line',
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    lineHeight: 22,
    padding: { top: 12, bottom: 12 },
    suggest: {
      showMethods: true,
      showFunctions: true,
      showVariables: true,
      showKeywords: true,
      showSnippets: true
    },
    ...options
  };

  const charCount = (value || '').length;

  const editorHeight = fullscreen ? 'calc(100vh - 36px)' : height;

  const containerSx = fullscreen
    ? {
        position: 'fixed',
        top: 0,
        bottom: 0,
        insetInline: 0,
        zIndex: 9999,
        bgcolor: '#1A1D23',
        display: 'flex',
        flexDirection: 'column'
      }
    : {
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden'
      };

  return (
    <Box sx={containerSx}>
      <LtrIsland sx={{ flex: fullscreen ? 1 : undefined }}>
        <Editor
          height={fullscreen ? '100%' : editorHeight}
          language={language}
          theme={theme}
          value={value}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          beforeMount={handleBeforeMount}
          options={defaultOptions}
          loading={<LoadingComponent />}
        />
      </LtrIsland>
      {/* Status bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 1.5,
          py: 0.5,
          bgcolor: '#1A1D23',
          borderTop: '1px solid',
          borderColor: 'divider',
          color: '#8B8F96',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          flexShrink: 0
        }}
      >
        <Typography variant="caption" sx={{ color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}>
          {t('vml.editor.position', { line: cursorInfo.line, col: cursorInfo.col })}
        </Typography>
        <Typography variant="caption" sx={{ color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}>
          Lua
        </Typography>
        <Typography variant="caption" sx={{ color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}>
          {t('vml.editor.chars', { chars: charCount })}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'inherit',
            fontSize: 'inherit',
            color: syntaxErrors > 0 ? '#F44747' : '#6EDB8A'
          }}
        >
          {syntaxErrors > 1 ? t('vml.editor.errorsMany', { n: syntaxErrors }) : syntaxErrors === 1 ? t('vml.editor.errorsOne') : t('vml.editor.noErrors')}
        </Typography>
      </Box>
    </Box>
  );
};

export default CodeEditor;
