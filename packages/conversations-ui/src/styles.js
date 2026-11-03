// Shared sx for the panels above the composer. Colours come from the host's
// theme variables (see chat-ui's theme contract).
export const panelSx = {
  mx: 'auto',
  my: 1,
  maxWidth: 800,
  p: 2,
  borderRadius: '12px',
  border: '1px solid var(--theme-border)',
  backgroundColor: 'var(--theme-bg-secondary)'
};

export const titleSx = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  color: 'var(--theme-text-tertiary)',
  mb: 1
};
