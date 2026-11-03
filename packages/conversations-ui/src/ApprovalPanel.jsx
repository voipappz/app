import { useEffect, useState } from 'react';
import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { panelSx, titleSx } from './styles';

const argsText = (args) => (args && Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : '');

/**
 * The bot wants to run tools that need approval. One decision per tool, in
 * the order listed; the batch is sent once every tool is decided.
 *
 * @param {{tools: import('./contract').PendingTool[], onDecide?: (d: import('./contract').Decision[]) => void, labels?: Object}} props
 */
const ApprovalPanel = ({ tools = [], onDecide, labels = {} }) => {
  const [decisions, setDecisions] = useState(() => tools.map(() => null));
  const [sent, setSent] = useState(false);
  // The arguments are part of the prompt: refund(1043) after refund(1042) is
  // a new prompt, and must not inherit the earlier decisions.
  const key = JSON.stringify(tools.map((t) => [t.name, t.arguments ?? null]));

  // A new prompt starts undecided and unsent.
  useEffect(() => { setDecisions(tools.map(() => null)); setSent(false); }, [key]);

  const decide = (idx, value) => setDecisions((d) => d.map((v, i) => (i === idx ? value : v)));
  const complete = decisions.length === tools.length && decisions.every(Boolean);
  // One batch per prompt: the buttons stay off until the next prompt arrives.
  const send = (batch) => { if (sent) return; setSent(true); onDecide?.(batch); };
  const all = (value) => send(tools.map(() => value));

  return (
    <Box data-testid="approval-panel" sx={panelSx}>
      <Typography sx={titleSx}>{labels.approvalTitle || 'The bot asks to run'}</Typography>
      {tools.map((tool, idx) => (
        <Box key={`${tool.name}-${idx}`} data-testid="approval-tool" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
              {tool.display_text || tool.name}
            </Typography>
            {argsText(tool.arguments) && (
              <Box component="pre" sx={{ m: 0, mt: 0.5, fontSize: '0.7rem', whiteSpace: 'pre-wrap', color: 'var(--theme-text-secondary)' }}>
                {argsText(tool.arguments)}
              </Box>
            )}
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={decisions[idx]}
            onChange={(_e, value) => value && decide(idx, value)}
            aria-label={tool.display_text || tool.name}
          >
            <ToggleButton value="approve" aria-label={labels.approve || 'Approve'}>{labels.approve || 'Approve'}</ToggleButton>
            <ToggleButton value="reject" aria-label={labels.reject || 'Reject'}>{labels.reject || 'Reject'}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        {tools.length > 1 && (
          <>
            <Button size="small" disabled={sent} onClick={() => all('reject')}>{labels.rejectAll || 'Reject all'}</Button>
            <Button size="small" disabled={sent} onClick={() => all('approve')}>{labels.approveAll || 'Approve all'}</Button>
          </>
        )}
        <Button size="small" variant="contained" disabled={!complete || sent} onClick={() => send(decisions)}>
          {labels.submitDecisions || 'Send decisions'}
        </Button>
      </Box>
    </Box>
  );
};

export default ApprovalPanel;
