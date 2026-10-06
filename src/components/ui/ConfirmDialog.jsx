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
import { Z } from '../../utils/zIndex.js';

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
  const id = useId();
  const { t } = useTranslation();
  // Defaults in the active language; a screen's own wording always wins.
  // `description={null}` (or '') still means "no description line".
  const shownDescription = description === undefined ? t('confirm.description') : description;
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
      sx={{ zIndex: Z.CONFIRM }}
      data-testid={testId}
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <DialogTitle id={titleId}>{title ?? t('confirm.title')}</DialogTitle>
      <DialogContent id={descId}>
        {message ?? (
          <Typography>
            {entityName
              ? <Trans i18nKey="confirm.deleteEntity" components={{ name: <strong>{entityName}</strong> }} />
              : t('confirm.continue')}
          </Typography>
        )}
        {shownDescription && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {shownDescription}
          </Typography>
        )}
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={loading}>
          {cancelLabel ?? t('action.cancel')}
        </Button>
        <Button
          data-testid={confirmTestId}
          onClick={() => onConfirm?.()}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {confirmLabel ?? t('action.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
