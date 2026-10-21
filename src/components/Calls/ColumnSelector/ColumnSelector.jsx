import React from 'react';
import { Menu, Checkbox, FormControlLabel, Button, Box, ButtonGroup } from '@mui/material';
import './ColumnSelector.css';
import useColumnSelector from './useColumnSelector';
import { useTranslation } from 'react-i18next';

const ColumnSelector = ({
  anchorEl,
  open,
  columns,
  visibleColumns,
  onToggle,
  onClose,
  onSelectAll,
  onDeselectAll,
  onReset
}) => {
  const { t } = useTranslation();
  const { handleToggle, handleClose } = useColumnSelector(onToggle, onClose);

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={handleClose}
      className="column-selector-menu"
      PaperProps={{
        sx: {
          maxWidth: '900px',
          minWidth: '300px'
        }
      }}
    >
      {/* Action buttons row */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid var(--border-dark)', display: 'flex', gap: 1 }}>
        <ButtonGroup size="small" variant="outlined">
          <Button onClick={onSelectAll}>
            {t('columnPicker.selectAll')}
          </Button>
          <Button onClick={onDeselectAll}>
            {t('columnPicker.deselectAll')}
          </Button>
          <Button onClick={onReset} color="warning">
            {t('columnPicker.reset')}
          </Button>
        </ButtonGroup>
      </Box>

      {/* Column checkboxes */}
      <Box sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        maxHeight: '400px',
        overflowY: 'auto',
        minWidth: '250px'
      }}>
        {columns.map((col) => {
          const fieldKey = col.field;
          const displayName = col.headerName || col.name || col.label || fieldKey;

          return (
            <FormControlLabel
              key={fieldKey}
              control={
                <Checkbox
                  checked={visibleColumns.includes(fieldKey)}
                  onChange={() => handleToggle(fieldKey)}
                  size="small"
                />
              }
              label={displayName}
              sx={{
                m: 0,
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.875rem'
                }
              }}
            />
          );
        })}
      </Box>
      <Box sx={{ p: 1, borderTop: '1px solid var(--border-dark)', textAlign: 'end' }}>
        <Button onClick={handleClose} size="small" variant="contained">
          {t('columnPicker.close')}
        </Button>
      </Box>
    </Menu>
  );
};

export default ColumnSelector;
