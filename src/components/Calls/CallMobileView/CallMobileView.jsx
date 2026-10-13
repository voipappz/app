import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useInView } from 'react-intersection-observer';
import CallLogRow from '../CallLogRow/CallLogRow';
import CallDetailsScreen from '../CallDetailsScreen/CallDetailsScreen';
import { dayKey, formatDayHeading } from '../../../utils/dateUtils';

// The calls in order, cut into runs of one day each (the API sends newest
// first, so the days come out newest first too).
const groupByDay = (rows) => {
  const groups = [];
  rows.forEach((call) => {
    const key = dayKey(call.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.calls.push(call);
    else groups.push({ key, date: call.created_at, calls: [call] });
  });
  return groups;
};

const CallMobileView = ({ rows, hasNextPage, loadingMore, onLoadMore, canViewEvents, onViewEvents }) => {
  const { t } = useTranslation('calls');
  // One line open at a time, like a phone's call history.
  const [openUuid, setOpenUuid] = useState(null);
  const [detailsCall, setDetailsCall] = useState(null);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const dayHeading = (group) => {
    if (group.key === today) return t('mobile.today');
    if (group.key === yesterday) return t('mobile.yesterday');
    return formatDayHeading(group.date);
  };
  // Intersection observer for lazy loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px', // Load more when user is 100px away from the bottom
  });

  // Trigger load more when the sentinel comes into view
  React.useEffect(() => {
    if (inView && hasNextPage && !loadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [inView, hasNextPage, loadingMore, onLoadMore]);

  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4, px: 2 }}>
        <Typography variant="h6" color="text.secondary">
          {t('mobile.empty')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('mobile.emptyHint')}
        </Typography>
      </Box>
    );
  }

  return (
    // The list scrolls itself: the page around it is a fixed-height column
    // (Layout clips its content), so the search and filter stay on top while
    // the calls move under them.
    <Box
      className="calls-mobile-view"
      data-testid="calls-mobile-list"
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        px: { xs: 1, sm: 2 },
        pb: 2,
      }}
    >
      {/* Like a phone's own call history: one heading per day, which stays
          at the top while that day's calls scroll under it. */}
      {groupByDay(rows).map((group) => (
        <Box component="section" key={group.key || 'unknown'}>
          <Typography
            variant="overline"
            component="h3"
            className="calls-mobile-day"
            data-testid="calls-mobile-day"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              display: 'block',
              py: 0.5,
              px: 0.5,
              fontWeight: 700,
              lineHeight: 1.8,
              color: 'text.secondary',
              bgcolor: 'var(--theme-bg-primary)',
            }}
          >
            {dayHeading(group)}
          </Typography>
          <Box component="ul" sx={{ p: 0, m: 0 }}>
            {group.calls.map((call) => {
              const id = call.uuid || call.id;
              return (
                <CallLogRow
                  key={id}
                  call={call}
                  expanded={openUuid === id}
                  onToggle={() => setOpenUuid((current) => (current === id ? null : id))}
                  onOpenDetails={setDetailsCall}
                />
              );
            })}
          </Box>
        </Box>
      ))}
      
      {/* Loading sentinel for lazy loading */}
      {hasNextPage && (
        <Box
          ref={loadMoreRef}
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            py: 3,
            minHeight: '60px'
          }}
        >
          {loadingMore && <CircularProgress size={30} />}
        </Box>
      )}
      
      {/* End of data indicator */}
      {!hasNextPage && rows.length > 0 && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {t('mobile.end')}
          </Typography>
        </Box>
      )}
      <CallDetailsScreen
        call={detailsCall}
        open={Boolean(detailsCall)}
        onClose={() => setDetailsCall(null)}
        onOpenCall={setDetailsCall}
        canViewEvents={canViewEvents}
        onViewEvents={onViewEvents}
      />
    </Box>
  );
};

export default CallMobileView;