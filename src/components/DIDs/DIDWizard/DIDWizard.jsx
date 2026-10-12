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
import { Close as CloseIcon } from '@mui/icons-material';
import { useWizard } from './DIDWizard.js';
import WizardBreadcrumb from './WizardBreadcrumb';
import WizardViewRenderer from './WizardViewRenderer';
import './DIDWizard.css';

/**
 * Descriptions shown at the top of the wizard for each view type.
 * Gives the user context about what they're configuring — AWS-style guidance.
 */
const VIEW_HELP = {
  did: {
    create: {
      title: 'Create a new Route',
      desc: 'Set up a new phone number (Route) and configure how incoming calls are routed. Fill in the details below, then choose a bridge to handle calls.',
    },
    edit: {
      title: 'Edit Route',
      desc: 'Update the settings for this phone number. You can change the name, routing, and metadata.',
    },
  },
  ivr: {
    create: {
      title: 'Create IVR',
      desc: 'Build an interactive voice menu. Callers will hear an announcement and press keys to reach different destinations.',
    },
    edit: {
      title: 'Edit IVR',
      desc: 'Modify this voice menu — update the announcement, timeout, or entry routing.',
    },
  },
  queue: {
    create: {
      title: 'Create Queue',
      desc: 'Set up a call queue. Incoming calls will be distributed to agents based on the strategy you choose.',
    },
    edit: {
      title: 'Edit Queue',
      desc: 'Update this queue\'s agents, strategy, or hold announcements.',
    },
  },
  announcement: {
    create: {
      title: 'Create Announcement',
      desc: 'Record or upload an audio announcement that can be used in IVRs, queues, or as a standalone destination.',
    },
    edit: {
      title: 'Edit Announcement',
      desc: 'Update this announcement\'s audio file or settings.',
    },
  },
  vml: {
    create: {
      title: 'Create VML Script',
      desc: 'Write a VoiceML script for advanced call flow logic.',
    },
    edit: {
      title: 'Edit VML Script',
      desc: 'Modify this VoiceML script.',
    },
  },
  call_condition: {
    create: {
      title: 'Create Call Condition',
      desc: 'Define time-based or conditional routing rules. Calls are routed differently based on the conditions you set.',
    },
    edit: {
      title: 'Edit Call Condition',
      desc: 'Update the conditions and routing for this call condition.',
    },
  },
  bot: {
    create: {
      title: 'Create Bot',
      desc: 'Set up an AI bot to handle incoming calls with automated responses.',
    },
    edit: {
      title: 'Edit Bot',
      desc: 'Update this bot\'s configuration and behavior.',
    },
  },
  extension: {
    create: {
      title: 'Create Device',
      desc: 'Add a new SIP device for a user.',
    },
    edit: {
      title: 'Edit Device',
      desc: 'Update this device\'s credentials and settings.',
    },
  },
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
  const help = currentView
    ? VIEW_HELP[currentView.type]?.[currentView.mode] || VIEW_HELP[currentView.type]?.create
    : null;

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
          aria-label="close"
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        {/* Header — title + help description */}
        <Box className="wizard-header">
          <Box sx={{ pr: 5, mb: 1.5 }}>
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
