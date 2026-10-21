import React from 'react';
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useTranslation } from 'react-i18next';

// `copyText` is what Copy puts on the clipboard when `value` is not plain
// text (a number wrapped in <Bdi>).
const DetailRow = ({ icon, label, value, chip, copyable, copyText }) => {
  const { t } = useTranslation('calls');
  if (value === null || value === undefined || value === '') return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(String(copyText ?? value));
  };

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      py: 1,
      px: 0.5,
      borderBottom: '1px solid var(--bg-tertiary)',
      '&:last-child': { borderBottom: 'none' }
    }}>
      {icon && (
        <Box sx={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
          {React.cloneElement(icon, { sx: { fontSize: 18 } })}
        </Box>
      )}
      <Typography variant="body2" sx={{
        color: 'var(--text-secondary)',
        fontSize: '0.8rem',
        fontWeight: 500,
        minWidth: 80,
        flexShrink: 0,
        fontFamily: 'Rubik, sans-serif'
      }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        {chip ? (
          <Chip
            label={value}
            size="small"
            color={chip.color || 'default'}
            variant={chip.variant || 'filled'}
            sx={{ fontSize: '0.75rem', height: 24 }}
          />
        ) : (
          <Typography variant="body2" noWrap sx={{
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontFamily: 'Rubik, sans-serif',
            fontWeight: 400
          }}>
            {value}
          </Typography>
        )}
        {copyable && (
          <Tooltip title={t('detail.copy')}>
            <IconButton size="small" onClick={handleCopy} aria-label={t('detail.copy')} sx={{ p: 0.25 }}>
              <ContentCopyIcon sx={{ fontSize: 14, color: 'var(--text-tertiary)' }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default DetailRow;
