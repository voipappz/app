import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
  TextField, CircularProgress, Alert,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { subscriptionsApi } from '../../services/api/subscriptionsApi';

/**
 * AddBalanceDialog — add to a subscription's balance.
 * Enter a positive amount of units to ADD. Calls POST /:uuid/credit, which
 * increments the balance atomically under an advisory lock and writes a
 * subscription.credit audit event (visible in the subscription's Events).
 */
const AddBalanceDialog = ({ open, subscription, onClose, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) { setAmount(''); setError(null); }
  }, [open]);

  const current = Number(subscription?.balance || 0);
  // Allowed for every type; on postpaid the balance is period usage, so say so.
  const isPostpaid = subscription?.type === 'postpaid';
  const parsed = parseInt(amount, 10);
  const valid = amount !== '' && !isNaN(parsed) && parsed > 0;
  const newBalance = current + (valid ? parsed : 0);

  const handleSave = async () => {
    if (!valid || !subscription?.uuid) return;
    setSaving(true);
    setError(null);
    try {
      // POST /:uuid/credit adds the DELTA atomically (advisory-locked, so a
      // call settling mid-request isn't clobbered) and writes the
      // subscription.credit audit into Events. A raw PATCH of an absolute
      // balance would do neither.
      const updated = await subscriptionsApi.creditSubscription(subscription.uuid, parsed);
      onSuccess?.(parsed, updated?.balance ?? newBalance);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccountBalanceWalletIcon sx={{ color: '#0e9488' }} />
        Add Balance
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {subscription?.name || subscription?.uuid} — current balance: <b>{current}</b>
        </Typography>

        {isPostpaid && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This subscription is postpaid: its balance is the current-period usage,
            invoiced when the period closes. Credit added here adjusts that balance.
          </Alert>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          label="Amount to add"
          size="small"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid && !saving) handleSave(); }}
          helperText={valid ? `New balance: ${newBalance}` : 'Positive integer units to add as credit'}
          fullWidth
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !valid}
          startIcon={saving ? <CircularProgress size={14} /> : null}
        >
          {saving ? 'Saving…' : 'Add Balance'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddBalanceDialog;
