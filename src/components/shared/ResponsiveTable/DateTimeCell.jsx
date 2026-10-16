import { Typography } from '@mui/material';
import { formatDate } from '../../../utils/dateUtils';
import { secondaryTextSx } from './density';

// A timestamp in a table cell: date and time on one line in the small
// secondary type, so a date column stays narrow and the row stays short.
export default function DateTimeCell({ value }) {
  return <Typography variant="body2" component="span" sx={secondaryTextSx}>{formatDate(value)}</Typography>;
}
