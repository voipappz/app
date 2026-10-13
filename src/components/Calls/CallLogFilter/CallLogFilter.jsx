import { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ArrowDropDown as OpenIcon, FilterList as FilterIcon } from '@mui/icons-material';

const CHOICES = ['all', 'incoming', 'outgoing', 'missed'];

/**
 * The phone call log's one filter, the way a phone's call history has it:
 * a button naming what is shown, and a short menu of the other choices.
 */
export default function CallLogFilter({ value = 'all', onChange }) {
  const { t } = useTranslation('calls');
  const [anchor, setAnchor] = useState(null);

  const choose = (choice) => {
    setAnchor(null);
    if (choice !== value) onChange(choice);
  };

  return (
    <>
      <Button
        variant={value === 'all' ? 'outlined' : 'contained'}
        size="small"
        startIcon={<FilterIcon />}
        endIcon={<OpenIcon />}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        data-testid="call-log-filter"
        sx={{ flexShrink: 0, borderRadius: 5, textTransform: 'none', whiteSpace: 'nowrap' }}
      >
        {t(`mobile.filter.${value}`)}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ list: { 'aria-label': t('mobile.filter.label') } }}>
        {CHOICES.map((choice) => (
          <MenuItem key={choice} selected={choice === value} onClick={() => choose(choice)}>
            {t(`mobile.filter.${choice}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
