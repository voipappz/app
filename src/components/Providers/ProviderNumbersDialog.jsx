import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { providersApi } from '../../services/api/providersApi';
import { extensionsApi } from '../../services/api/extensionsApi';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useIsUserSession } from '../../hooks/useIsUserSession';

const errorMessage = (error) => error?.response?.data?.message || error?.message || 'Request failed';
const price = (value, currency) => value == null ? 'Not provided' : `${value} ${currency || ''}`;

export default function ProviderNumbersDialog({ provider, onClose }) {
  const { selectedEnvironments = [] } = useCustomerEnvironment();
  const { can, canRouteType } = usePermissions();
  const userSession = useIsUserSession();
  const canBuy = !userSession && canRouteType('dst', 'write');
  const [country, setCountry] = useState('US');
  const [type, setType] = useState('local');
  const [area, setArea] = useState('');
  const [numbers, setNumbers] = useState(null);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [environment, setEnvironment] = useState('');
  const [extension, setExtension] = useState('');
  const [extensions, setExtensions] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  // An ambiguous response must never turn into an accidental second order.
  const [attempted, setAttempted] = useState([]);
  const id = provider.uuid || provider.id;

  useEffect(() => {
    let active = true;
    setExtensions([]);
    setExtension('');
    setLoadingExtensions(Boolean(environment));
    if (environment) {
      extensionsApi.getExtensions({ 'search[environment_uuid]': environment, per_page: 999 })
        .then((data) => {
          if (active) setExtensions(Array.isArray(data) ? data : data?.data || []);
        })
        .catch((err) => { if (active) setError(errorMessage(err)); })
        .finally(() => { if (active) setLoadingExtensions(false); });
    }
    return () => { active = false; };
  }, [environment]);

  const run = async (action, operation) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action); setError(''); setMessage('');
    try { await operation(); }
    catch (err) { setError(errorMessage(err)); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const test = () => run('test', async () => {
    const result = await providersApi.testConnection(id);
    if (!result.ok) throw new Error(result.error || 'Connection test failed');
    setMessage(`Connected to Telnyx. Balance: ${price(result.balance, result.currency)}. No number was purchased.`);
  });
  const search = () => run('search', async () => {
    setSelected(null); setNumbers(null);
    if (!/^[A-Za-z]{2}$/.test(country.trim())) throw new Error('Enter a two-letter country code, for example US or IL.');
    const result = await providersApi.searchNumbers(id, { country, type, area });
    if (!Array.isArray(result)) throw new Error('The server returned an invalid number list.');
    setNumbers(result);
  });
  const buy = () => {
    if (!canBuy || !selected || !extension || !selectedEnvironments.some((item) => item.uuid === environment)
      || attempted.includes(selected.number)) return;
    run('buy', async () => {
      setAttempted((previous) => [...previous, selected.number]);
      try {
        const route = await providersApi.buyNumber({ provider_uuid: id, number: selected.number,
          environment_uuid: environment, bridge_type: 'extension', bridge_uuid: extension });
        setNumbers((previous) => previous?.filter((item) => item.number !== selected.number));
        setMessage(`Purchased +${selected.number}. ${route.enabled ? 'The route is active.' : 'Activation is pending; check Routes for its status.'}`);
        setSelected(null);
      } catch (err) {
        throw new Error(`${errorMessage(err)} Check Routes and Telnyx orders before trying another purchase; the order may have reached Telnyx.`);
      }
    });
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{provider.name} — Numbers and connection</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography>The connection test checks your saved Telnyx API key and balance. Searching does not buy numbers.</Typography>
          <Button onClick={test} disabled={Boolean(busy) || !can('providers', 'write')}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
          {message && <Alert severity="success">{message}</Alert>}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <TextField label="Country code" helperText="Two letters, e.g. US or IL" value={country} disabled={Boolean(busy)}
              onChange={(event) => { setCountry(event.target.value.toUpperCase()); setNumbers(null); setSelected(null); }} />
            <TextField select label="Number type" value={type} disabled={Boolean(busy)} sx={{ minWidth: 160 }}
              onChange={(event) => { setType(event.target.value); setNumbers(null); setSelected(null); }}>
              <MenuItem value="local">Local</MenuItem><MenuItem value="toll-free">Toll-free</MenuItem>
              <MenuItem value="mobile">Mobile</MenuItem>
            </TextField>
            <TextField label="Area code (optional)" value={area} disabled={Boolean(busy)}
              onChange={(event) => { setArea(event.target.value); setNumbers(null); setSelected(null); }} />
            <Button variant="contained" onClick={search} disabled={Boolean(busy)}>
              {busy === 'search' ? 'Searching…' : 'Search available numbers'}
            </Button>
          </Box>
          {numbers?.length === 0 && <Alert severity="info">No available numbers match this search.</Alert>}
          {Boolean(numbers?.length) && <>
            <Typography variant="body2">These are Telnyx carrier costs. Your subscription plan determines your billed setup and monthly charges.</Typography>
            <Box sx={{ overflowX: 'auto' }}><Table size="small">
              <TableHead><TableRow><TableCell>Number</TableCell><TableCell>Setup cost</TableCell>
                <TableCell>Monthly cost</TableCell><TableCell>Action</TableCell></TableRow></TableHead>
              <TableBody>{numbers.map((number) => <TableRow key={number.number} selected={selected?.number === number.number}>
                <TableCell>+{number.number}</TableCell><TableCell>{price(number.setup, number.currency)}</TableCell>
                <TableCell>{price(number.monthly, number.currency)}</TableCell>
                <TableCell><Button disabled={Boolean(busy) || !canBuy || attempted.includes(number.number)}
                  onClick={() => { setSelected(number); setError(''); setMessage(''); }}>Select</Button></TableCell>
              </TableRow>)}</TableBody>
            </Table></Box>
          </>}
          {!canBuy && <Alert severity="info">Buying numbers requires an account with permission to create incoming routes.</Alert>}
          {selected && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">Buy +{selected.number}</Typography>
            <TextField select label="Application" required value={environment} disabled={Boolean(busy)}
              onChange={(event) => { setEnvironment(event.target.value); setExtension(''); }}>
              {selectedEnvironments.map((item) => <MenuItem key={item.uuid} value={item.uuid}>{item.name}</MenuItem>)}
            </TextField>
            {!selectedEnvironments.length && <Alert severity="info">Select an application in the admin application selector first.</Alert>}
            <TextField select label="Route incoming calls to extension" required value={extension}
              disabled={Boolean(busy) || !environment || loadingExtensions}
              onChange={(event) => setExtension(event.target.value)}>
              {extensions.map((item) => <MenuItem key={item.uuid} value={item.uuid}>{item.name || item.username || item.uuid}</MenuItem>)}
            </TextField>
            {environment && !loadingExtensions && !extensions.length && <Alert severity="info">Create an extension in this application before buying. You can change the destination later in Routes.</Alert>}
            <Alert severity="warning">This places a real Telnyx order and creates an incoming route. Your application needs an active subscription whose plan allows buying numbers. Setup and recurring charges follow that plan.</Alert>
            <Button variant="contained" onClick={buy} disabled={Boolean(busy) || !canBuy || !extension
              || loadingExtensions || !selectedEnvironments.some((item) => item.uuid === environment) || attempted.includes(selected.number)}>
              {busy === 'buy' ? 'Buying…' : `Confirm purchase of +${selected.number}`}
            </Button>
          </Box>}
        </Box>
      </DialogContent>
      <DialogActions><Button disabled={Boolean(busy)} onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
