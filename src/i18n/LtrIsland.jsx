import { Box } from '@mui/material';

// A region that stays left-to-right in Hebrew: charts (time runs left to right
// in every language), flow canvases, keypads. MUI components inside still
// follow the page's direction; this is for charts and drawings.
export default function LtrIsland({ children, sx, ...rest }) {
  return <Box dir="ltr" sx={{ textAlign: 'start', ...sx }} {...rest}>{children}</Box>;
}
