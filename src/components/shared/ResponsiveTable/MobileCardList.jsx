import { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useInView } from 'react-intersection-observer';
import MobileRecordCard from './MobileRecordCard';

/**
 * A stack of cards with infinite scroll, for phones.
 *
 * Generalised from Calls/CallMobileView, which proved the pattern on two
 * screens: a sentinel below the last card, observed with
 * react-intersection-observer, that asks for the next page when it scrolls
 * into view. Pagination controls are a poor fit on a phone — the buttons are
 * small, and you have already scrolled to the bottom by the time you want more.
 *
 * Falls back gracefully: a screen whose API cannot do cursor paging simply
 * omits onLoadMore, and this renders the current page with no sentinel. That
 * matters because most of the 29 table screens page by offset today.
 */
const MobileCardList = ({
  columns,
  rows,
  getRowId,
  onRowClick,
  renderCard,
  emptyMessage = 'No results',
  endMessage,
  hasNextPage,
  loadingMore,
  onLoadMore,
}) => {
  const { ref: sentinelRef, inView } = useInView({ threshold: 0, rootMargin: '100px' });

  useEffect(() => {
    if (inView && hasNextPage && !loadingMore && onLoadMore) onLoadMore();
  }, [inView, hasNextPage, loadingMore, onLoadMore]);

  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
        <Typography variant="body2" color="text.secondary">{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <Box data-testid="responsive-table-cards" sx={{ px: { xs: 1, sm: 2 }, pb: 2 }}>
      {rows.map((row, index) => {
        // An index fallback rather than Math.random(): a random key remounts
        // every card on every render, which loses focus and scroll position.
        const key = getRowId ? getRowId(row) : (row?.uuid ?? row?.id ?? index);
        return renderCard
          ? <Box key={key}>{renderCard(row)}</Box>
          : (
            <MobileRecordCard
              key={key}
              columns={columns}
              row={row}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            />
          );
      })}

      {hasNextPage && onLoadMore && (
        <Box
          ref={sentinelRef}
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 3, minHeight: 60 }}
        >
          {loadingMore && <CircularProgress size={30} />}
        </Box>
      )}

      {!hasNextPage && endMessage && rows.length > 0 && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary">{endMessage}</Typography>
        </Box>
      )}
    </Box>
  );
};

export default MobileCardList;
