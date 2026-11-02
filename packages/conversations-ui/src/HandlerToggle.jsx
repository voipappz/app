import { Button } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';

/**
 * Take the conversation over from the bot, or hand it back. While a person
 * handles it, what they type is the reply and the bot stays quiet.
 *
 * @param {{handler?: import('./contract').Handler, onChange?: (h: import('./contract').Handler) => void, disabled?: boolean, labels?: Object}} props
 */
const HandlerToggle = ({ handler = 'bot', onChange, disabled = false, labels = {} }) => {
  const human = handler === 'human';
  return (
    <Button
      size="small"
      variant={human ? 'contained' : 'outlined'}
      data-testid="handler-toggle"
      data-handler={human ? 'human' : 'bot'}
      disabled={disabled || !onChange}
      startIcon={human ? <SmartToyIcon /> : <PersonIcon />}
      onClick={() => onChange?.(human ? 'bot' : 'human')}
      sx={{ textTransform: 'none' }}
    >
      {human ? (labels.handBack || 'Hand back to bot') : (labels.takeOver || 'Take over')}
    </Button>
  );
};

export default HandlerToggle;
