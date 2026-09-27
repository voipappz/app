import React from 'react';
import { Box, Typography, Button, ButtonGroup, IconButton } from '@mui/material';
import { GridFooterContainer } from '@mui/x-data-grid';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import './CustomFooter.css';

// Windowed page list: 1 … c-1 c c+1 … N ('…' entries render as disabled).
const pageWindow = (current, total) => {
  if (!total || total <= 7) return Array.from({ length: total || 1 }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
};

const CustomFooter = ({
  isClientFiltered,
  loadingMore,
  hasNextPage,
  onClearFilter,
  currentPage,
  totalPages,
  totalRecords,
  onGoToPage,
  // Outside a DataGrid (the Logs screen) there is no grid context, and
  // GridFooterContainer throws without one.
  standalone = false,
}) => {
  const Container = standalone ? Box : GridFooterContainer;
  return (
    <Container {...(standalone ? { sx: { borderTop: 1, borderColor: 'divider' } } : {})}>
      <Box className="custom-footer-root">
        <Box className="custom-footer-pagination">
          <IconButton
            aria-label="Previous page"
            size="small"
            onClick={() => onGoToPage?.(currentPage - 1)}
            disabled={currentPage <= 1}
            sx={{ p: 0.25, color: 'var(--theme-text-secondary)' }}
          >
            <NavigateBeforeIcon sx={{ fontSize: 18 }} />
          </IconButton>

          {/* Numbered pages as buttons — same idiom as the 15m/1h period chips */}
          <ButtonGroup size="small" variant="outlined" sx={{ mx: 0.5 }}>
            {pageWindow(currentPage, totalPages).map((p, i) => (
              <Button
                key={`${p}-${i}`}
                disabled={p === '…'}
                onClick={() => p !== '…' && onGoToPage?.(p)}
                variant={p === currentPage ? 'contained' : 'outlined'}
                aria-label={p === '…' ? undefined : p === currentPage ? `Current page ${p}` : `Go to page ${p}`}
                aria-current={p === currentPage ? 'page' : undefined}
                sx={{ minWidth: 30, px: 0.75, fontSize: '11px', py: 0.1 }}
              >
                {p}
              </Button>
            ))}
          </ButtonGroup>

          <IconButton
            aria-label="Next page"
            size="small"
            onClick={() => onGoToPage?.(currentPage + 1)}
            disabled={!hasNextPage && (!totalPages || currentPage >= totalPages)}
            sx={{ p: 0.25, color: 'var(--theme-text-secondary)' }}
          >
            <NavigateNextIcon sx={{ fontSize: 18 }} />
          </IconButton>

          {totalRecords > 0 && (
            <Typography variant="body2" sx={{
              color: 'var(--theme-text-secondary)',
              fontFamily: 'var(--font-family)',
              fontSize: '0.72rem',
              fontWeight: 600,
              ml: 0.75,
              whiteSpace: 'nowrap',
            }}>
              {totalRecords.toLocaleString()}
            </Typography>
          )}
        </Box>

        <Box className="custom-footer-info">
          {isClientFiltered && (
            <Button size="small" onClick={onClearFilter} className="custom-footer-clear">
              Clear Filter
            </Button>
          )}
          {loadingMore && (
            <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)', fontSize: '0.75rem' }}>
              Loading...
            </Typography>
          )}
        </Box>
      </Box>
    </Container>
  );
};

export default CustomFooter;
