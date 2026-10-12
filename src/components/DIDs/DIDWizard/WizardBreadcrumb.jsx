import { useState } from 'react';
import { Box, IconButton, Menu, MenuItem } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  NavigateNext as ChevronIcon,
  MoreHoriz as MoreIcon,
} from '@mui/icons-material';
import { Z, menuProps } from '../../../utils/zIndex.js';

/**
 * WizardBreadcrumb Component
 * AWS-style step pills with numbered badges.
 *
 * Example: [1 DID: JOEL EDRICK] > [2 IVR: main-menu] > [3 Queue: support]
 *          ─── past (clickable) ──   ─── past ──────────   ─── active ─────
 */
const WizardBreadcrumb = ({ viewStack, onNavigateTo, compact = false }) => {
  if (compact) return <CompactTrail viewStack={viewStack} onNavigateTo={onNavigateTo} />;
  return (
    <Box className="wizard-breadcrumb-bar">
      {viewStack.map((view, index) => {
        const isLast = index === viewStack.length - 1;
        const styleClass = isLast ? 'wizard-crumb--active' : 'wizard-crumb--past';

        return (
          <Box key={view.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            {index > 0 && (
              <ChevronIcon className="wizard-crumb-separator" fontSize="small" />
            )}
            <button
              className={`wizard-crumb ${styleClass}`}
              onClick={isLast ? undefined : () => onNavigateTo(index)}
              type="button"
            >
              <span className="wizard-crumb-number">{index + 1}</span>
              {view.label}
            </button>
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * The trail on a phone, on one line: the step before, then the current step.
 * Earlier steps fold into a "⋯" menu, and long names end in "…" — the way
 * design systems (Carbon, eBay) shorten a breadcrumb on a small screen.
 * A single step needs no trail: the title already names it.
 */
const CompactTrail = ({ viewStack, onNavigateTo }) => {
  const { t } = useTranslation('routes');
  const [menuAnchor, setMenuAnchor] = useState(null);
  if (viewStack.length < 2) return null;
  const current = viewStack.length - 1;
  const parent = current - 1;
  const earlier = viewStack.slice(0, parent);

  const goTo = (index) => {
    setMenuAnchor(null);
    onNavigateTo(index);
  };

  return (
    <Box component="nav" aria-label={t('wizard.steps')} className="wizard-breadcrumb-compact" data-testid="wizard-breadcrumb-compact">
      {earlier.length > 0 && (
        <>
          <IconButton size="small" aria-label={t('wizard.earlierSteps')} className="wizard-crumb-more" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)} {...menuProps(Z.L1)}>
            {earlier.map((view, index) => (
              <MenuItem key={view.id} onClick={() => goTo(index)}>{view.label}</MenuItem>
            ))}
          </Menu>
          <ChevronIcon className="wizard-crumb-separator" fontSize="small" />
        </>
      )}
      <button type="button" className="wizard-crumb wizard-crumb--past wizard-crumb-parent" onClick={() => goTo(parent)}>
        <span className="wizard-crumb-label">{viewStack[parent].label}</span>
      </button>
      <ChevronIcon className="wizard-crumb-separator" fontSize="small" />
      <span className="wizard-crumb-current" aria-current="page">
        <span className="wizard-crumb-label">{viewStack[current].label}</span>
      </span>
    </Box>
  );
};

export default WizardBreadcrumb;
