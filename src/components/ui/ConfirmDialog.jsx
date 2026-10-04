import { useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

/**
 * ConfirmDialog — the one confirmation dialog.
 *
 * Replaces the local DeleteConfirmDialog every screen used to carry (the same
 * ~40 lines, copied a dozen times, drifting in wording and markup). A screen
 * keeps its own open/loading state and passes what differs: the title, the
 * entity's name, a sentence about consequences.
 *
 *   <ConfirmDialog
 *     open={deleteOpen} loading={deleting}
 *     title="Delete User" entityName={user?.name}
 *     description="This action cannot be undone and will remove all user data."
 *     onClose={closeDelete} onConfirm={doDelete}
 *   />
 *
 * `destructive` (the default) makes the confirm button red. The title and body
 * are wired to the dialog with aria-labelledby/aria-describedby, so a screen
 * reader announces what is being confirmed. MUI already gives Esc -> onClose
 * and focus trapping; Enter confirms. While `loading`, both buttons lock and
 * Esc/backdrop do nothing, so a slow delete cannot be half-cancelled.
 *
 * The confirm button is data-testid="confirm-delete-button" by default (the
 * Playwright suite clicks it); `confirmTestId` keeps a screen's own id.
 */
const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  entityName,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  loading = false,
  children,
  'data-testid': testId,
  confirmTestId = 'confirm-delete-button',
}) => {
  const { t } = useTranslation();
  // Defaults resolved here rather than in the destructuring, because they are
  // translated and a hook cannot run in a parameter list. `defaultValue` keys
  // them to the exact English they replaced, so a locale file that lacks a key
  // renders what this component always rendered.
  const dialogTitle = title ?? t('common:confirm.title', { defaultValue: 'Are you sure?' });
  const dialogDescription = description
    ?? t('common:confirm.description', { defaultValue: 'This action cannot be undone.' });
  const confirmText = confirmLabel ?? t('common:action.delete', { defaultValue: 'Delete' });
  const cancelText = cancelLabel ?? t('common:action.cancel', { defaultValue: 'Cancel' });

  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  const close = (_event, reason) => {
    if (loading) return;
    onClose?.(_event, reason);
  };

  // Enter confirms — but only from the dialog itself, never from a control
  // that has its own Enter behaviour. Cancel is the one that mattered: keydown
  // bubbles, so the old "anything but a textarea" test meant a keyboard user
  // pressing Enter on Cancel DELETED the record.
  const INTERACTIVE = 'button, input, select, textarea, a[href], [contenteditable="true"]';

  const onKeyDown = (event) => {
    if (event.key !== 'Enter' || loading || event.defaultPrevented) return;
    if (event.target?.closest?.(INTERACTIVE)) return;

    event.preventDefault();
    onConfirm?.();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      onKeyDown={onKeyDown}
      maxWidth="xs"
      fullWidth
      data-testid={testId}
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <DialogTitle id={titleId}>{dialogTitle}</DialogTitle>
      <DialogContent id={descId}>
        {message ?? (
          <Typography>
            {entityName
              ? (
                // Trans, not t(): the name stays bold, and Hebrew puts it in a
                // different place in the sentence than English does.
                <Trans
                  i18nKey="confirm.deleteEntity"
                  ns="common"
                  values={{ name: entityName }}
                  components={{ strong: <strong /> }}
                  defaults="Are you sure you want to delete <strong>{{name}}</strong>?"
                />
              )
              : t('common:confirm.continue', { defaultValue: 'Are you sure you want to continue?' })}
          </Typography>
        )}
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {dialogDescription}
          </Typography>
        )}
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          data-testid={confirmTestId}
          onClick={() => onConfirm?.()}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
