import {
  Call as CallIcon,
  CallMade as OutgoingIcon,
  CallMissed as MissedIcon,
  CallMissedOutgoing as MissedOutgoingIcon,
  CallReceived as IncomingIcon,
} from '@mui/icons-material';

const ICONS = {
  incoming: { Icon: IncomingIcon, color: 'success' },
  outgoing: { Icon: OutgoingIcon, color: 'primary' },
  missedIncoming: { Icon: MissedIcon, color: 'error' },
  missedOutgoing: { Icon: MissedOutgoingIcon, color: 'error' },
  unknown: { Icon: CallIcon, color: 'action' },
};

// The arrow a phone's call history shows: in, out, or missed (red). The words
// for it are the row's label; the icon itself is decoration.
export default function CallDirectionIcon({ kind, fontSize = 'small' }) {
  const { Icon, color } = ICONS[kind] || ICONS.unknown;
  return <Icon color={color} fontSize={fontSize} aria-hidden data-kind={kind} />;
}
