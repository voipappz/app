import { Box, IconButton, Link, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

export default function EntityLink({ name, onEdit, disabled = false, ariaLabel }) {
  const label = name == null || name === '' ? '' : String(name);
  if (!label || !onEdit || disabled) {
    return <Typography variant="body2" component="span">{label || '-'}</Typography>;
  }
  const edit = (event) => { event.stopPropagation(); onEdit(); };
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, '&:hover .entity-link-edit': { opacity: 1 } }}>
      <Link
        component="button" type="button" variant="body2" underline="hover"
        aria-label={ariaLabel || `Edit ${label}`} onClick={edit}
        sx={{ textAlign: 'left', font: 'inherit' }}
      >
        {label}
      </Link>
      <IconButton className="entity-link-edit" size="small" tabIndex={-1} aria-hidden onClick={edit} sx={{ p: 0.25, opacity: 0, transition: 'opacity 120ms' }}>
        <EditIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}
