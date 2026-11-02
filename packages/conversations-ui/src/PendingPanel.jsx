import { Box, Button, Typography } from '@mui/material';
import ApprovalPanel from './ApprovalPanel';
import QuestionsPanel from './QuestionsPanel';
import { panelSx, titleSx } from './styles';

/** The bot stopped and waits for the operator to acknowledge it. */
export const HaltNotice = ({ message, onDismiss, labels = {} }) => (
  <Box data-testid="halt-notice" sx={panelSx}>
    <Typography sx={titleSx}>{labels.haltTitle || 'The bot stopped'}</Typography>
    <Typography sx={{ fontSize: '0.85rem', color: 'var(--theme-text-primary)', mb: 1 }}>{message}</Typography>
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button size="small" variant="contained" onClick={() => onDismiss?.()}>{labels.dismiss || 'Dismiss'}</Button>
    </Box>
  </Box>
);

/**
 * Whatever the bot waits on: an approval, questions or a halt. Nothing for
 * `{type: 'none'}`.
 *
 * @param {{pending?: import('./contract').Pending, onDecide?: Function, onAnswer?: Function, onDismiss?: Function, labels?: Object}} props
 */
const PendingPanel = ({ pending, onDecide, onAnswer, onDismiss, labels = {} }) => {
  switch (pending?.type) {
    case 'approval':
      return <ApprovalPanel tools={pending.tools} onDecide={onDecide} labels={labels} />;
    case 'questions':
      return <QuestionsPanel questions={pending.questions} onAnswer={onAnswer} labels={labels} />;
    case 'halt':
      return <HaltNotice message={pending.message} onDismiss={onDismiss} labels={labels} />;
    default:
      return null;
  }
};

export default PendingPanel;
