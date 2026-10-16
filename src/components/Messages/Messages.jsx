import React, { useMemo, useEffect, useState, useCallback } from 'react';
import './Messages.css';
import useMessages from './Messages.js';
import { useAuth } from '../../context/AuthContext';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { config } from '../../config.js';

import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import { stripedDataGridSx, EmptyValue } from '../shared/tableTheme.jsx';
import CustomFooter from '../Calls/CustomFooter/CustomFooter.jsx';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';

import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ChatIcon from '@mui/icons-material/Chat';
import EventsIcon from '@mui/icons-material/EventNote';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import SmsIcon from '@mui/icons-material/Sms';
import CloseIcon from '@mui/icons-material/Close';
import { formatDate } from '../../utils/dateUtils';

const Messages = () => {
  const [quickSearchText, setQuickSearchText] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [currentSearchParams, setCurrentSearchParams] = useState({});

  const { access } = useAuth();
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  const {
    columns: apiColumns,
    allRows,
    hasNextPage,
    currentPage,
    totalPages,
    totalRecords,
    loadingMessages,
    loadingMore,
    errorMessages,
    fetchMessages,
    loadMoreMessages,
    goToPage,
    dateRange,
    setDateRange,
    sortModel,
    handleSortModelChange,
    segments,
  } = useMessages();

  // Register segments with GlobalSearchContext
  useEffect(() => {
    if (segments && segments.length > 0) {
      registerScreen('messages', segments, {
        onSearch: (params) => {
          setCurrentSearchParams(params);
          fetchMessages(dateRange, params);
        },
        onClear: () => {
          setCurrentSearchParams({});
          fetchMessages(dateRange, null);
        },
      });
    }
    return () => unregisterScreen();
  }, [segments, registerScreen, unregisterScreen]);

  // Handle date range changes
  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
    fetchMessages(newRange, currentSearchParams);
  };

  const handleRefresh = () => {
    fetchMessages(dateRange, currentSearchParams);
  };

  const handleFilterChange = useCallback((params, append = false) => {
    const newParams = append ? { ...currentSearchParams, ...params } : params;
    setCurrentSearchParams(newParams);
    fetchMessages(dateRange, newParams);
  }, [currentSearchParams, dateRange, fetchMessages]);

  const handleClearAllFilters = useCallback(() => {
    setCurrentSearchParams({});
    setQuickSearchText('');
    fetchMessages(dateRange, null);
  }, [dateRange, fetchMessages]);

  const handleQuickSearch = (e) => {
    if (e.key === 'Enter') {
      if (quickSearchText.trim()) {
        const searchParams = { 'search[inline]': quickSearchText.trim() };
        setCurrentSearchParams(searchParams);
        fetchMessages(dateRange, searchParams);
      } else {
        handleClearAllFilters();
      }
    }
  };

  const handleQuickSearchChange = (value) => {
    setQuickSearchText(value);
    if (value === '') {
      handleClearAllFilters();
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const searchQueryParams = {};
      const [startDate, endDate] = dateRange;

      if (startDate && endDate) {
        const startTimestamp = Math.floor(new Date(startDate).setHours(0, 0, 0, 0) / 1000);
        const endTimestamp = Math.floor(new Date(endDate).setHours(23, 59, 59, 999) / 1000);
        searchQueryParams[`search[created_at]`] = `${startTimestamp} - ${endTimestamp}`;
      }

      if (currentSearchParams && typeof currentSearchParams === 'object') {
        Object.entries(currentSearchParams).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
            searchQueryParams[key] = value;
          }
        });
      }

      const queryParams = new URLSearchParams();
      queryParams.append('per_page', '1000');
      Object.entries(searchQueryParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(item => queryParams.append(`${key}[]`, item));
        } else {
          queryParams.append(key, value);
        }
      });

      const API_BASE_URL = config.apiBaseUrl;
      const exportUrl = `${API_BASE_URL}/messages?${queryParams.toString()}`;

      const response = await fetch(exportUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': access ? `Bearer ${access}` : '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        let actualData = Array.isArray(data) ? data : (data.data || data.results || data.items || []);

        const flattenObject = (obj, prefix = '') => {
          const flattened = {};
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const value = obj[key];
              const newKey = prefix ? `${prefix}.${key}` : key;
              if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(flattened, flattenObject(value, newKey));
              } else {
                flattened[newKey] = value;
              }
            }
          }
          return flattened;
        };

        const allKeys = new Set();
        actualData.forEach(item => {
          Object.keys(flattenObject(item)).forEach(key => allKeys.add(key));
        });

        const keyArray = Array.from(allKeys).sort();
        const headers = keyArray.join(',');
        const csvRows = actualData.map(item => {
          const flattened = flattenObject(item);
          return keyArray.map(key => {
            const value = flattened[key];
            const stringValue = value === null || value === undefined ? '' : String(value);
            return stringValue.includes(',') || stringValue.includes('"')
              ? `"${stringValue.replace(/"/g, '""')}"`
              : stringValue;
          }).join(',');
        });

        const csvContent = [headers, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `messages-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  // Infinite scroll handler
  const handleRowsScrollEnd = useCallback(() => {
    if (hasNextPage && !loadingMore) {
      loadMoreMessages(dateRange);
    }
  }, [hasNextPage, loadingMore, loadMoreMessages, dateRange]);

  // Build rows with unique IDs
  const rows = useMemo(() => {
    return allRows.map((row, index) => ({
      ...row,
      id: row.uuid || row.id || index,
    }));
  }, [allRows]);

  // Build grid columns from API columns
  const gridColumns = useMemo(() => {
    // API columns tell us which fields exist and their sort keys, but the
    // data structure needs special handling (some fields live in `profile`
    // sub-object, environment is a nested object, etc.). Use the well-tested
    // default column definitions that understand the data shape, filtering
    // to only show columns the API marks as selected.
    const selectedFields = apiColumns && apiColumns.length > 0
      ? new Set(apiColumns.filter(c => c.selected !== false).map(c => c.prop || c.field?.replace(/^message\./, '')))
      : null; // null = show all columns

    return [
      {
        field: 'created_at',
        headerName: 'Date Created',
        width: 170,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
            {formatDate(params.value)}
          </Typography>
        ),
      },
      { field: 'environment_name', headerName: 'Application', width: 140,
        valueGetter: (value, row) => value || row?.environment?.name || ''
      },
      { field: 'type', headerName: 'Type', width: 110,
        valueGetter: (value, row) => value || row?.profile?.type || '',
        renderCell: (params) => {
          const type = params.value;
          const colorMap = { email: 'primary', sms: 'success', slack: 'warning', webhook: 'info' };
          return type ? (
            <Chip label={type} size="small" color={colorMap[type] || 'default'} variant="outlined" sx={{ fontSize: '0.75rem' }} />
          ) : '-';
        }
      },
      { field: 'status', headerName: 'Status', width: 110,
        valueGetter: (value, row) => value || row?.profile?.status || '',
        renderCell: (params) => {
          const status = params.value;
          const colorMap = { delivered: 'success', sent: 'info', failed: 'error', pending: 'warning', processing: 'info', read: 'success' };
          return status ? (
            <Chip label={status} size="small" color={colorMap[status] || 'default'} sx={{ fontSize: '0.75rem' }} />
          ) : '-';
        }
      },
      { field: 'direction', headerName: 'Direction', width: 110,
        valueGetter: (value, row) => value || row?.profile?.direction || '',
        renderCell: (params) => {
          const dir = params.value;
          return dir ? (
            <Chip
              icon={dir === 'outbound' ? <CallMadeIcon sx={{ fontSize: 14 }} /> : <CallReceivedIcon sx={{ fontSize: 14 }} />}
              label={dir}
              size="small"
              color={dir === 'outbound' ? 'primary' : 'success'}
              variant="outlined"
              sx={{ fontSize: '0.75rem' }}
            />
          ) : '-';
        }
      },
      { field: 'subject', headerName: 'Subject', width: 200,
        valueGetter: (value, row) => value || row?.profile?.subject || '',
        renderCell: (params) => (
          <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem' }} title={params.value}>
            {params.value || <EmptyValue />}
          </Typography>
        ),
      },
      { field: 'body', headerName: 'Body', flex: 1, minWidth: 200,
        valueGetter: (value, row) => value || row?.profile?.body || row?.content || '',
        renderCell: (params) => (
          <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem' }} title={params.value}>
            {params.value || <EmptyValue />}
          </Typography>
        ),
      },
    ].filter(col => !selectedFields || selectedFields.has(col.field) || col.field === 'body');
  }, [apiColumns]);

  // Summary counters
  const summaryCounts = useMemo(() => {
    const total = rows.length;
    let inbound = 0, outbound = 0;
    rows.forEach(row => {
      const direction = row.direction || row.profile?.direction;
      if (direction === 'outbound') outbound++;
      else if (direction === 'inbound') inbound++;
    });
    return { total, inbound, outbound };
  }, [rows]);

  // Sort model change with search params sync
  const handleSortModelChangeWithSync = (newSortModel) => {
    handleSortModelChange(newSortModel);
    const updatedParams = { ...currentSearchParams };
    if (newSortModel.length > 0) {
      updatedParams.order_by = newSortModel[0].field;
      updatedParams.order_type = newSortModel[0].sort;
    } else {
      delete updatedParams.order_by;
      delete updatedParams.order_type;
    }
    setCurrentSearchParams(updatedParams);
  };

  return (
    <Box sx={{
      px: { xs: 0.5, sm: 1.5 },
      py: { xs: 0.5, sm: 1 },
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header row: Title + Search */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CentralizedSearch
            segments={segments}
            currentSearchParams={currentSearchParams}
            onFilterChange={handleFilterChange}
            onQuickSearch={handleQuickSearch}
            onClearAllFilters={handleClearAllFilters}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            onRefresh={handleRefresh}
            onExport={handleExport}
            quickSearchText={quickSearchText}
            onQuickSearchChange={handleQuickSearchChange}
            placeholder="Search messages: number, text or ID"
            textParam="search[inline]"
            showExclude={true}
          />
        </Box>
      </Box>

      {/* Summary Counters */}
      {rows.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1, mt: 0.5, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: summaryCounts.total, colorVar: '--counter-total', icon: <ChatIcon /> },
            { label: 'Outbound', value: summaryCounts.outbound, colorVar: '--counter-outgoing', icon: <CallMadeIcon /> },
            { label: 'Inbound', value: summaryCounts.inbound, colorVar: '--counter-incoming', icon: <CallReceivedIcon /> },
          ].map((item) => (
            <Paper
              key={item.label}
              elevation={0}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                border: '1px solid',
                borderColor: 'var(--theme-border)',
                borderRadius: '6px',
                backgroundColor: 'var(--theme-bg-secondary)',
                transition: 'all 0.15s ease',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: 'var(--shadow-subtle)',
                  borderColor: `var(${item.colorVar})`,
                  backgroundColor: 'var(--theme-hover)',
                }
              }}
            >
              {React.cloneElement(item.icon, {
                sx: { fontSize: 18, color: `var(${item.colorVar})`, opacity: 0.9 }
              })}
              <Typography sx={{
                fontWeight: 600,
                fontSize: '0.9rem',
                lineHeight: 1,
                color: 'var(--theme-text-primary)',
                fontFamily: 'Rubik, sans-serif',
              }}>
                {item.value}
              </Typography>
              <Typography sx={{
                fontSize: '0.75rem',
                fontWeight: 500,
                opacity: 0.9,
                color: 'var(--theme-text-secondary)',
                fontFamily: 'Rubik, sans-serif',
              }}>
                {item.label}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}

      {/* Data Grid + Detail Panel */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, transition: 'flex 0.25s ease' }}>
          <DataGrid
            rows={rows}
            columns={gridColumns}
            loading={loadingMessages}
            error={errorMessages}
            onRowsScrollEnd={handleRowsScrollEnd}
            onRowClick={(params) => setSelectedMessage(params.row)}
            hideFooterPagination
            disableSelectionOnClick
            autoHeight={false}
            rowHeight={44}
            sx={{
              ...stripedDataGridSx,
              height: '100%',
              border: '1px solid var(--theme-border)',
              borderRadius: '8px',
              backgroundColor: 'var(--widget-content-bg)',
              fontFamily: 'var(--font-family)',
              fontSize: '0.875rem',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'var(--widget-header-bg)',
                borderBottom: '1px solid var(--theme-border)',
              },
              '& .MuiDataGrid-columnHeader': {
                backgroundColor: 'var(--widget-header-bg)',
                color: 'var(--theme-text-primary)',
                fontWeight: 600,
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid var(--theme-border)',
                color: 'var(--theme-text-primary)',
              },
              '& .MuiDataGrid-row': {
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'var(--theme-hover)' },
                '&.Mui-selected': {
                  backgroundColor: 'var(--accent-primary-alpha-8)',
                  '&:hover': { backgroundColor: 'var(--accent-primary-alpha-12)' },
                },
              },
              '& .MuiDataGrid-footerContainer': {
                backgroundColor: 'var(--widget-header-bg)',
                borderTop: '1px solid var(--theme-border)',
              },
              '& .MuiDataGrid-virtualScroller': {
                backgroundColor: 'var(--widget-content-bg)',
              },
            }}
            sortingMode="server"
            sortModel={sortModel}
            onSortModelChange={handleSortModelChangeWithSync}
            slots={{
              footer: () => (
                <CustomFooter
                  isClientFiltered={false}
                  loadingMore={loadingMore}
                  hasNextPage={hasNextPage}
                  onClearFilter={handleClearAllFilters}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalRecords={totalRecords}
                  onGoToPage={(page) => goToPage(page, dateRange)}
                />
              ),
            }}
          />
        </Box>

        {/* Message Detail Panel */}
        {selectedMessage && (
          <Paper
            elevation={3}
            sx={{
              width: 360,
              ml: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--theme-border)',
            }}
          >
            <Box sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--theme-border)',
              backgroundColor: 'var(--widget-header-bg)',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmsIcon sx={{ fontSize: 20, color: 'var(--accent-primary)' }} />
                <Typography variant="subtitle2" fontWeight={600}>Message Details</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <RowEventsButton subject="message" uuid={selectedMessage.uuid} />
                <IconButton size="small" onClick={() => setSelectedMessage(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
              {[
                { label: 'Date', value: formatDate(selectedMessage.created_at) },
                { label: 'Direction', value: selectedMessage.direction || selectedMessage.profile?.direction },
                { label: 'Type', value: selectedMessage.type || selectedMessage.profile?.type },
                { label: 'Status', value: selectedMessage.status || selectedMessage.profile?.status },
                { label: 'Subject', value: selectedMessage.subject || selectedMessage.profile?.subject },
                { label: 'From', value: selectedMessage.from || selectedMessage.profile?.from },
                { label: 'To', value: selectedMessage.to || selectedMessage.profile?.to },
                { label: 'Channel', value: selectedMessage.channel || selectedMessage.profile?.channel },
                { label: 'Application', value: selectedMessage.environment_name || selectedMessage.environment?.name },
                { label: 'UUID', value: selectedMessage.uuid },
              ].map((item) => item.value && (
                <Box key={item.label} sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {item.label}
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
              {/* Message body */}
              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'var(--theme-bg-secondary)', borderRadius: 1, border: '1px solid var(--theme-border)' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  Message
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {selectedMessage.body || selectedMessage.profile?.body || selectedMessage.content || 'No content'}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default Messages;
