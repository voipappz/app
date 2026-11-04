import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Radio, TextField, Typography } from '@mui/material';
import { panelSx, titleSx } from './styles';

const empty = (questions) => questions.map(() => ({ selected: [], other: '' }));

/** A form state -> the response Connectix.Chat.answer/3 takes. */
export const toResponse = ({ selected, other }) => {
  const text = other.trim();
  return text ? { type: 'answer', selected, other_text: text } : { type: 'answer', selected };
};

const answered = ({ selected, other }) => selected.length > 0 || other.trim().length > 0;

/**
 * The bot asks one or more questions. Each takes one option (or several when
 * `multiple`) and free text when `allow_other`. The answers go in one batch,
 * in order; "Skip" cancels every question.
 *
 * @param {{questions: import('./contract').Question[], onAnswer?: (r: import('./contract').QuestionResponse[]) => void, labels?: Object}} props
 */
const QuestionsPanel = ({ questions = [], onAnswer, labels = {} }) => {
  const [state, setState] = useState(() => empty(questions));
  const [sent, setSent] = useState(false);
  // The options are part of the prompt, not only the wording.
  const key = JSON.stringify(questions.map((q) => [q.question, q.options ?? null, q.multiple ?? false]));

  useEffect(() => { setState(empty(questions)); setSent(false); }, [key]);
  const send = (responses) => { if (sent) return; setSent(true); onAnswer?.(responses); };

  const update = (idx, change) => setState((s) => s.map((v, i) => (i === idx ? { ...v, ...change } : v)));

  const toggle = (idx, question, value) => {
    const current = state[idx]?.selected || [];
    const selected = question.multiple
      ? (current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
      : [value];
    update(idx, { selected });
  };

  const complete = state.length === questions.length && state.every(answered);

  return (
    <Box data-testid="questions-panel" sx={panelSx}>
      <Typography sx={titleSx}>{labels.questionsTitle || 'The bot asks'}</Typography>
      {questions.map((q, idx) => {
        const Control = q.multiple ? Checkbox : Radio;
        return (
          <Box key={`${q.question}-${idx}`} data-testid="question" sx={{ mb: 1.5 }} role="group" aria-label={q.question}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>{q.question}</Typography>
            {q.context && (
              <Typography sx={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)', mb: 0.5 }}>{q.context}</Typography>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {(q.options || []).map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  control={
                    <Control
                      size="small"
                      checked={(state[idx]?.selected || []).includes(opt.value)}
                      onChange={() => toggle(idx, q, opt.value)}
                    />
                  }
                  label={
                    <Box>
                      <Typography component="span" sx={{ fontSize: '0.85rem' }}>{opt.label}</Typography>
                      {opt.description && (
                        <Typography component="span" sx={{ fontSize: '0.7rem', color: 'var(--theme-text-tertiary)', ml: 1 }}>
                          {opt.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
            </Box>
            {q.allow_other && (
              <TextField
                size="small"
                fullWidth
                placeholder={labels.other || 'Other'}
                value={state[idx]?.other || ''}
                onChange={(e) => update(idx, { other: e.target.value })}
                slotProps={{ htmlInput: { 'aria-label': `${q.question}: ${labels.other || 'Other'}` } }}
                sx={{ mt: 0.5 }}
              />
            )}
          </Box>
        );
      })}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" disabled={sent} onClick={() => send(questions.map(() => ({ type: 'cancel' })))}>
          {labels.skip || 'Skip'}
        </Button>
        <Button size="small" variant="contained" disabled={!complete || sent} onClick={() => send(state.map(toResponse))}>
          {labels.submitAnswers || 'Answer'}
        </Button>
      </Box>
    </Box>
  );
};

export default QuestionsPanel;
