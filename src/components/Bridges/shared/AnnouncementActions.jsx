import { Box, IconButton, Tooltip } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import AudioPreview from '../../common/AudioPreview/AudioPreview.jsx';

/**
 * ▶ and ✎ beside a chosen announcement, wherever one is picked: hear it, and
 * open its editor. Nothing shows until one is chosen.
 *
 * @param {string} uuid - The chosen announcement.
 * @param {function} onEdit - Opens its editor; without it there is no ✎.
 */
export default function AnnouncementActions({ uuid, onEdit }) {
  const { t } = useTranslation('bridges');
  if (!uuid) return null;

  // From `sm` up it keeps room for the player as it opens, so the row does not
  // jump; a phone has no room to spare, and the select beside it needs it.
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, minWidth: { xs: 0, sm: 160 } }}>
      <AudioPreview key={uuid} uuid={uuid} />
      {onEdit && (
        <Tooltip title={t('queue.editAnnouncement')}>
          <IconButton onClick={() => onEdit(uuid)} size="small" color="primary" aria-label={t('queue.editAnnouncement')}>
            <EditIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
