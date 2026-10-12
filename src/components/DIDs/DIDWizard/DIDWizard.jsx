import { useCallback } from 'react';
import {
  Dialog,
  Typography,
  IconButton,
  Box,
  Fade,
  Slide,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { Close as CloseIcon } from '@mui/icons-material';
import { useWizard } from './DIDWizard.js';
import WizardBreadcrumb from './WizardBreadcrumb';
import WizardViewRenderer from './WizardViewRenderer';
import './DIDWizard.css';

/**
 * Descriptions shown at the top of the wizard for each view type.
 * Gives the user context about what they're configuring — AWS-style guidance.
 * The texts are `wizard.help.<type>.<create|edit>.<title|desc>`.
 */
const VIEW_HELP = {
  did: { create: 'wizard.help.did.create', edit: 'wizard.help.did.edit' },
  ivr: { create: 'wizard.help.ivr.create', edit: 'wizard.help.ivr.edit' },
  queue: { create: 'wizard.help.queue.create', edit: 'wizard.help.queue.edit' },
  announcement: { create: 'wizard.help.announcement.create', edit: 'wizard.help.announcement.edit' },
  vml: { create: 'wizard.help.vml.create', edit: 'wizard.help.vml.edit' },
  call_condition: { create: 'wizard.help.call_condition.create', edit: 'wizard.help.call_condition.edit' },
  bot: { create: 'wizard.help.bot.create', edit: 'wizard.help.bot.edit' },
  extension: { create: 'wizard.help.extension.create', edit: 'wizard.help.extension.edit' },
};

/**
 * DIDWizard Component
 * AWS-style panel wizard — not fullscreen, centered panel with breadcrumb pills.
 */
const DIDWizard = ({
  bridgeTypes,
  bridgeResources,
  didTypes,
  onFetchBridgeResources,
  onSaveDID,
  onClose,
  loading,
  wizardState,
}) => {
  const { t } = useTranslation('routes');
  const {
    viewStack,
    isOpen,
    currentView,
    canGoBack,
    close,
    pushView,
    popView,
    navigateTo,
  } = wizardState;

  // Handle drill-down from any form
  const handleDrillDown = useCallback(({ type, mode, data, environmentUuid, onResult }) => {
    const typeName = type === 'call_condition' ? 'Call Condition' : type.toUpperCase();
    const entityName = data?.name || '(new)';

    pushView({
      type,
      mode,
      label: `${typeName}: ${entityName}`,
      data,
      environmentUuid,
      onResult,
    });
  }, [pushView]);

  // Handle cancel/back from a view
  const handleViewCancel = useCallback((result = null) => {
    if (result) {
      popView(result);
    } else if (canGoBack) {
      popView();
    } else {
      close();
      onClose();
    }
  }, [canGoBack, popView, close, onClose]);

  // Handle DID save (root level)
  const handleDIDSave = useCallback(async (didData) => {
    await onSaveDID(didData);
    close();
  }, [onSaveDID, close]);

  // Handle breadcrumb navigation
  const handleNavigateTo = useCallback((index) => {
    navigateTo(index);
  }, [navigateTo]);

  // Handle close button
  const handleClose = useCallback(() => {
    close();
    onClose();
  }, [close, onClose]);

  // On a phone the form fills the screen: its fields need the keyboard, which
  // would cover half of a smaller panel.
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));

  // Get help text for current view
  const helpKey = currentView
    ? VIEW_HELP[currentView.type]?.[currentView.mode] || VIEW_HELP[currentView.type]?.create
    : null;
  const help = helpKey ? { title: t(`${helpKey}.title`), desc: t(`${helpKey}.desc`) } : null;

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isPhone}
      className="wizard-dialog"
      data-testid="did-wizard"
      TransitionComponent={isPhone ? Slide : Fade}
      TransitionProps={isPhone ? { direction: 'up', timeout: 250 } : { timeout: 200 }}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(30, 37, 48, 0.4)' }
        }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* Close button */}
        <IconButton
          onClick={handleClose}
          className="wizard-close-btn"
          aria-label={t('wizard.close')}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        {/* Header — title + help description */}
        <Box className="wizard-header">
          <Box sx={{ pe: 5, mb: 1.5 }}>
            {help && (
              <>
                <Typography className="wizard-header-title">
                  {help.title}
                </Typography>
                {!isPhone && (
                  <Typography className="wizard-header-desc" sx={{ mt: 0.5 }}>
                    {help.desc}
                  </Typography>
                )}
              </>
            )}
          </Box>

          {/* Breadcrumb pills — inside the header area */}
          {viewStack.length > 0 && (
            <WizardBreadcrumb
              viewStack={viewStack}
              onNavigateTo={handleNavigateTo}
              compact={isPhone}
              onBack={() => popView()}
              canGoBack={canGoBack}
            />
          )}
        </Box>

        {/* View content */}
        <Box className="wizard-view-container" sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewStack.map((view, index) => {
            const isActive = index === viewStack.length - 1;

            return (
              <Box
                key={view.id}
                className={`wizard-view ${isActive ? 'wizard-view--active' : 'wizard-view--hidden'}`}
              >
                <WizardViewRenderer
                  view={view}
                  bridgeTypes={bridgeTypes}
                  bridgeResources={bridgeResources}
                  didTypes={didTypes}
                  onFetchBridgeResources={onFetchBridgeResources}
                  onSaveDID={handleDIDSave}
                  onCancel={handleViewCancel}
                  onDrillDown={handleDrillDown}
                  loading={loading}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Dialog>
  );
};

export { useWizard };
export default DIDWizard;
