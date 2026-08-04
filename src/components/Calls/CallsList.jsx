import { Fragment } from 'react';
import {
  Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, Typography,
} from '@mui/material';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import { useTranslation } from 'react-i18next';
import StatusChip from '../common/StatusChip';
import TranscriptionChip from './TranscriptionChip';
import CallMobileCard from './CallMobileCard';
import { fmtDuration, asDate } from './callFormat';

/**
 * The two renderings of the grouped call list (see callsGrouping.js):
 *
 *  - `CallsTable`    — the sortable nine-column table, md and up.
 *  - `CallsCardList` — one card per call, below md. A nine-column table cannot
 *    be made readable at 360px, so the phone gets cards rather than a sideways
 *    scroll; nothing is dropped, the columns are just stacked (CallMobileCard).
 *
 * Both walk the SAME sections through `renderSections`, so they cannot drift
 * apart on which groups appear or how they nest. Calls.jsx mounts exactly one.
 */

// `hide` columns drop out below the md breakpoint to keep the table usable on
// small tablets (phones get the card list instead).
const COLUMNS = [
  { key: 'direction', labelKey: null, sortable: false },
  { key: 'from_number', labelKey: 'from', sortable: true },
  { key: 'to_number', labelKey: 'to', sortable: true },
  { key: 'duration_seconds', labelKey: 'duration', sortable: true, align: 'right' },
  { key: 'status', labelKey: 'status', sortable: true },
  { key: 'started_at', labelKey: 'started', sortable: true, hide: true },
  { key: 'leg_count', labelKey: 'legs', sortable: true, align: 'right', hide: true },
  { key: 'event_count', labelKey: 'events', sortable: true, align: 'right', hide: true },
  { key: 'transcription_status', labelKey: 'transcript', sortable: true },
];
const colDisplay = (col) => (col.hide ? { display: { xs: 'none', md: 'table-cell' } } : null);

/**
 * Walk the grouped sections once. The table and the card list differ only in
 * what a header and a row look like.
 *
 * @param header (label, kind, count, level) => node
 * @param row    call => node
 */
function renderSections(sections, { groupBy, header, row }) {
  return sections.map((sec, si) => (
    <Fragment key={`g-${sec.label ?? si}`}>
      {sec.label && header(sec.label, sec.kind, sec.count, 0)}
      {sec.subs.map((sub, sj) => (
        <Fragment key={`s-${sec.label ?? si}-${sub.label ?? sj}`}>
          {sub.label && groupBy === 'time' && header(sub.label, sub.kind, sub.rows.length, 1)}
          {sub.rows.map(row)}
        </Fragment>
      ))}
    </Fragment>
  ));
}

function CallRow({ c, onSelect }) {
  return (
    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => onSelect(c)}>
      <TableCell sx={{ width: 40 }}>{c.direction === 'inbound'
        ? <CallReceivedIcon fontSize="small" sx={{ color: 'info.main' }} />
        : <CallMadeIcon fontSize="small" sx={{ color: 'success.main' }} />}</TableCell>
      <TableCell sx={{ fontWeight: 500, unicodeBidi: 'isolate' }}>{c.from_number}</TableCell>
      <TableCell sx={{ unicodeBidi: 'isolate' }}>{c.to_number}</TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{fmtDuration(c.duration_seconds)}</TableCell>
      <TableCell><StatusChip status={c.status} /></TableCell>
      <TableCell sx={{ color: 'text.secondary', ...colDisplay(COLUMNS[5]) }}>{c.started_at ? asDate(c.started_at).toLocaleString() : '—'}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary', ...colDisplay(COLUMNS[6]) }}>{c.leg_count ?? '—'}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary', ...colDisplay(COLUMNS[7]) }}>{c.event_count ?? '—'}</TableCell>
      <TableCell><TranscriptionChip status={c.transcription_status} /></TableCell>
    </TableRow>
  );
}

function GroupHeader({ label, count, level, colSpan }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ bgcolor: level === 0 ? 'action.hover' : 'action.selected', py: 0.5, borderBottom: 'none' }}>
        <Typography variant={level === 0 ? 'subtitle2' : 'caption'} sx={{ fontWeight: level === 0 ? 700 : 600 }}>
          {label} <Chip size="small" label={count} sx={{ mx: 1, height: 18, borderRadius: '6px' }} />
        </Typography>
      </TableCell>
    </TableRow>
  );
}

// The same header, unshackled from the table grid — the card list has no
// columns to span, so it is a plain strip above the cards it introduces.
function MobileGroupHeader({ label, count, level }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: level === 0 ? 1.5 : 0.5, '&:first-of-type': { mt: 0 } }}>
      <Typography variant={level === 0 ? 'subtitle2' : 'caption'} sx={{ fontWeight: level === 0 ? 700 : 600 }}>
        {label}
      </Typography>
      <Chip size="small" label={count} sx={{ height: 18, borderRadius: '6px' }} />
    </Box>
  );
}

export function CallsTable({ sections, groupBy, groupLabel, orderBy, order, onSort, onSelect, isEmpty }) {
  const { t } = useTranslation();
  const colSpan = COLUMNS.length;

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxWidth: '100%', overflowX: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {COLUMNS.map((col) => (
              <TableCell key={col.key} align={col.align} sx={{ fontWeight: 600, bgcolor: 'background.paper', ...colDisplay(col) }}>
                {col.sortable ? (
                  <TableSortLabel
                    active={orderBy === col.key}
                    direction={orderBy === col.key ? order : 'asc'}
                    onClick={() => onSort(col.key)}
                  >
                    {col.labelKey ? t(`calls.col.${col.labelKey}`) : ''}
                  </TableSortLabel>
                ) : (col.labelKey ? t(`calls.col.${col.labelKey}`) : '')}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {renderSections(sections, {
            groupBy,
            header: (label, kind, count, level) => (
              <GroupHeader key={`h-${level}-${label}`} label={groupLabel(label, kind)} count={count} level={level} colSpan={colSpan} />
            ),
            row: (c) => <CallRow key={c.id} c={c} onSelect={onSelect} />,
          })}
          {isEmpty && (
            <TableRow><TableCell colSpan={colSpan} align="center">
              <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>{t('calls.noCalls')}</Typography>
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function CallsCardList({ sections, groupBy, groupLabel, onSelect, isEmpty }) {
  const { t } = useTranslation();

  return (
    <Box data-testid="calls-mobile-list" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {renderSections(sections, {
        groupBy,
        header: (label, kind, count, level) => (
          <MobileGroupHeader key={`h-${level}-${label}`} label={groupLabel(label, kind)} count={count} level={level} />
        ),
        row: (c) => <CallMobileCard key={c.id} call={c} onClick={onSelect} />,
      })}
      {isEmpty && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t('calls.noCalls')}
        </Typography>
      )}
    </Box>
  );
}
