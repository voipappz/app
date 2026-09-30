import { useMemo, useRef, useState } from 'react';
import {
  Box, Popover, TextField, InputAdornment, Typography, Tooltip, Divider, IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { useAuth } from '../../../context/AuthContext';
import './SidebarCustomerSwitcher.css';

const initial = (name = '?') => (name.trim()[0] || '?').toUpperCase();
const tagsOf = (c) => ((c?.meta && typeof c.meta === 'object')
  ? Object.entries(c.meta).map(([k, v]) => (v ? `${k}:${v}` : k))
  : []);

// The search only earns its row once the list no longer fits at a glance.
const SEARCH_FROM = 8;

// The customer dialog (create / edit / duplicate) is the top bar's: it holds
// the full record and the save path. This only asks for it.
const openCustomer = (mode, customer) => window.dispatchEvent(
  new CustomEvent('openCustomerEdit', { detail: { mode, customer } })
);

/**
 * The customer, as a tile at the top of the sidebar. `root` only decides how
 * many customers an account sees: with several the tile opens the switcher;
 * with one there is nothing to switch to, so it opens that customer's settings.
 */
const SidebarCustomerSwitcher = () => {
  const { customers, selectedCustomer, selectCustomer, isRoot } = useCustomerEnvironment();
  const { accountCustomer } = useAuth();
  const triggerRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const current = selectedCustomer || accountCustomer || null;
  const currentName = current?.name || 'No customer';

  const all = useMemo(() => (
    (customers && customers.length ? customers : (accountCustomer ? [accountCustomer] : []))
      .filter(c => c && c.name && c.name.trim())
  ), [customers, accountCustomer]);

  // Matches the name or a meta tag (key or key:value).
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(c => c.name.toLowerCase().includes(q)
      || tagsOf(c).some(t => t.toLowerCase().includes(q)));
  }, [all, search]);

  // Editing is tenancy-gated by the API, not by `root`: an account may always
  // edit its own customer. Create and duplicate act outside its tenant.
  const canEdit = (c) => Boolean(c) && (isRoot || c.uuid === accountCustomer?.uuid);
  const switchable = isRoot || all.length > 1;

  const close = () => { setOpen(false); setSearch(''); };

  const handleSelect = async (c) => {
    close();
    if (c?.uuid && c.uuid !== selectedCustomer?.uuid) await selectCustomer(c);
  };

  const handleTrigger = () => {
    if (switchable) setOpen(true);
    else if (canEdit(current)) openCustomer('edit', current);
  };

  const act = (e, mode, customer) => { e.stopPropagation(); close(); openCustomer(mode, customer); };

  return (
    <>
      <Tooltip title={open ? '' : currentName} placement="right" arrow>
        <Box
          ref={triggerRef}
          className={`scs-trigger ${open ? 'open' : ''}`}
          onClick={handleTrigger}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTrigger(); } }}
          role="button"
          tabIndex={0}
          aria-label={switchable ? 'Switch customer' : 'Manage customer'}
          aria-haspopup={switchable ? 'dialog' : undefined}
          data-testid="sidebar-customer-switcher"
        >
          <Box className="scs-avatar">{initial(currentName)}</Box>
        </Box>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={triggerRef.current}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { className: 'scs-panel' } }}
      >
        {all.length >= SEARCH_FROM && (
          <Box className="scs-search">
            <TextField
              autoFocus fullWidth size="small" variant="standard" placeholder="Search customers…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                disableUnderline: true,
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'text.disabled' }} /></InputAdornment>
                )
              }}
            />
          </Box>
        )}

        <Box className="scs-list">
          {list.length === 0 ? (
            <Typography className="scs-empty">No customers</Typography>
          ) : list.map(c => {
            const active = c.uuid === selectedCustomer?.uuid;
            return (
              <Box key={c.uuid} className={`scs-row ${active ? 'active' : ''}`} onClick={() => handleSelect(c)}>
                <Box className="scs-check-slot">{active && <CheckIcon className="scs-check" />}</Box>
                <Box className="scs-row-avatar">{initial(c.name)}</Box>
                <Typography className="scs-row-name" noWrap>{c.name}</Typography>
                {c.enabled === false && <span className="scs-row-tag">Disabled</span>}
                {canEdit(c) && (
                  <Box className="scs-row-actions">
                    {isRoot && (
                      <Tooltip title="Duplicate customer">
                        <IconButton size="small" aria-label={`Duplicate ${c.name}`} onClick={(e) => act(e, 'duplicate', c)}>
                          <ContentCopyIcon sx={{ fontSize: 13 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit customer">
                      <IconButton size="small" aria-label={`Edit ${c.name}`} onClick={(e) => act(e, 'edit', c)}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        <Divider className="scs-divider" />

        <Box className="scs-actions">
          {isRoot && (
            <Box className="scs-action primary" role="button" onClick={(e) => act(e, 'create', null)}>
              <AddIcon className="scs-action-ic" /> Add customer
            </Box>
          )}
          {canEdit(current) && (
            <Box className="scs-action" role="button" onClick={(e) => act(e, 'edit', current)}>
              <SettingsOutlinedIcon className="scs-action-ic" /> Manage customer
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default SidebarCustomerSwitcher;
