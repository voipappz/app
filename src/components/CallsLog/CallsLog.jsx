import React from 'react';
import { Box, Paper, IconButton, Tooltip } from '@mui/material';
import {
  Menu as MenuIcon,
  MenuOpen as MenuOpenIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useCallsLog } from './CallsLog.js';
import CallsLogSidebar from './CallsLogSidebar.jsx';
import CallsLogTable from './CallsLogTable.jsx';
import './CallsLog.css';

/**
 * Calls Log Screen
 * Sloggo-style layout with left sidebar for filters and main table area
 * Uses syslog API for call-related logging
 */
const CallsLog = () => {
  const { t } = useTranslation('callsLog');
  const {
    logs,
    apps,
    loading,
    pagination,
    filters,
    searchQuery,
    selectedApp,
    timePeriod,
    tagFilters,
    totalCount,
    sidebarOpen,
    setPagination,
    setSearchQuery,
    setSelectedApp,
    setTimePeriod,
    addTagFilter,
    removeTagFilter,
    toggleLogLevel,
    clearFilters,
    applyFilters,
    refreshLogs,
    setSidebarOpen,
  } = useCallsLog();

  // Handle page change
  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Handle rows per page change
  const handleRowsPerPageChange = (newLimit) => {
    setPagination({ page: 0, limit: newLimit });
  };

  // Handle level click to filter
  const handleLevelClick = (level) => {
    // Toggle only this level on
    toggleLogLevel(level);
  };

  return (
    <Box className="calls-log-container" sx={{ display: 'flex', height: '100%' }}>
      {/* Toggle Sidebar Button */}
      <Box
        sx={{
          position: 'absolute',
          insetInlineStart: sidebarOpen ? 280 : 0,
          top: 8,
          zIndex: 1100,
          transition: 'inset-inline-start 0.3s ease',
        }}
      >
        <Tooltip title={sidebarOpen ? t('sidebar.hide') : t('sidebar.show')}>
          <IconButton
            onClick={() => setSidebarOpen(!sidebarOpen)}
            sx={{
              backgroundColor: 'background.paper',
              boxShadow: 1,
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            {sidebarOpen ? <MenuOpenIcon /> : <MenuIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Sidebar */}
      <Box
        sx={{
          width: sidebarOpen ? 280 : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {sidebarOpen && (
          <CallsLogSidebar
            apps={apps}
            filters={filters}
            searchQuery={searchQuery}
            selectedApp={selectedApp}
            timePeriod={timePeriod}
            tagFilters={tagFilters}
            onSearchChange={setSearchQuery}
            onAppChange={setSelectedApp}
            onTimePeriodChange={setTimePeriod}
            onToggleLogLevel={toggleLogLevel}
            onRemoveTagFilter={removeTagFilter}
            onApply={applyFilters}
            onClear={clearFilters}
          />
        )}
      </Box>

      {/* Main Content */}
      <Paper
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        <CallsLogTable
          logs={logs}
          loading={loading}
          pagination={pagination}
          totalCount={totalCount}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
          onRefresh={refreshLogs}
          onTagClick={addTagFilter}
          onLevelClick={handleLevelClick}
        />
      </Paper>
    </Box>
  );
};

export default CallsLog;
