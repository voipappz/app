// AddWidgetMenu — the portal's "add a widget" flow, presets first.
//
// The end user is not here to write queries: they pick something they
// recognise ("Calls today") and it appears. So the menu lists ready-made
// widgets from WIDGET_TEMPLATES, each already pointed at a measurement/field
// this platform actually has. The raw measurement/field/aggregation pickers
// still exist, but behind "Custom widget…" — one step further in, not the
// front door.
import { useState } from 'react';
import {
  Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import { applyTemplate, TEMPLATE_CATEGORIES, WIDGET_TEMPLATES, withDefaults } from './widgetTemplates';
import { resolveIcon } from './widgetPresentation';

const CATEGORY_LABELS = {
  calls: 'Calls',
  live: 'Right now',
  counters: 'Numbers',
  gauges: 'Gauges',
  trends: 'Charts',
  tables: 'Tables',
  explore: 'Explore'
};

export default function AddWidgetMenu({ onPick, disabled }) {
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);

  const pickTemplate = (key) => {
    close();
    onPick(applyTemplate(key));
  };

  return (
    <>
      <Button
        variant="contained" size="small" startIcon={<AddIcon />} disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget)} data-testid="add-widget"
        sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
      >
        Add widget
      </Button>

      <Menu
        anchorEl={anchor} open={Boolean(anchor)} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 260, maxHeight: 460 } } }}
      >
        {Object.entries(TEMPLATE_CATEGORIES).map(([category, keys]) => [
          <MenuItem key={`${category}-label`} disabled sx={{ opacity: '1 !important' }}>
            <Typography variant="overline" color="text.secondary">{CATEGORY_LABELS[category] || category}</Typography>
          </MenuItem>,
          ...keys.filter((key) => WIDGET_TEMPLATES[key]).map((key) => {
            const template = WIDGET_TEMPLATES[key];
            const Icon = resolveIcon(template.icon);
            return (
              <MenuItem key={key} onClick={() => pickTemplate(key)} data-testid={`widget-preset-${key}`}>
                <ListItemIcon sx={{ color: 'primary.main' }}><Icon fontSize="small" /></ListItemIcon>
                <ListItemText primary={template.title} />
              </MenuItem>
            );
          })
        ])}

        <Divider />
        <MenuItem
          onClick={() => { close(); onPick(withDefaults({ title: 'New widget' })); }}
          data-testid="widget-preset-custom"
        >
          <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Custom widget…" secondary="Pick your own metric" />
        </MenuItem>
      </Menu>
    </>
  );
}
