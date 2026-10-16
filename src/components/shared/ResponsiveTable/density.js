// The admin list tables' dense sizing, in one place. ResponsiveTable applies
// the table tokens when `dense` (the default); the column files take the chip,
// text and width tokens from here instead of carrying numbers of their own.
export const DENSITY = {
  cellPadding: '6px 10px',
  rowHeight: 40,
  secondaryFontSize: '0.75rem',
  chipHeight: 22,
  chipFontSize: '0.72rem',
};

// Preferred widths for the short columns. Text columns carry none and flex.
export const COLUMN_WIDTHS = {
  icon: 50,
  chip: 80,
  typeChip: 120,
  number: 170,
};

// On the <Table>: tight cells, 40px rows, headers on one line, the browser
// sizing the columns from their content over the container's full width.
export const denseTableSx = {
  width: '100%',
  tableLayout: 'auto',
  '& .MuiTableRow-root': { height: DENSITY.rowHeight },
  '& .MuiTableCell-root': { padding: DENSITY.cellPadding },
  '& .MuiTableCell-head': { whiteSpace: 'nowrap' },
};

// On a small <Chip> in a cell.
export const denseChipSx = {
  height: DENSITY.chipHeight,
  fontSize: DENSITY.chipFontSize,
  '& .MuiChip-label': { px: 0.75 },
};

// Secondary text in a cell (dates): one line, small, muted.
export const secondaryTextSx = {
  fontSize: DENSITY.secondaryFontSize,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
};
