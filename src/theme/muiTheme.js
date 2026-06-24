import { createTheme, darken } from '@mui/material/styles';
// import { prefixer } from 'stylis';
// import rtlPlugin from 'stylis-plugin-rtl';
// import createCache from '@emotion/cache';

// ============================================
// GLOBAL DIRECTION CONFIG - Change this to switch entire app
// ============================================
// Check localStorage first, fallback to 'rtl'
export const APP_DIRECTION = localStorage.getItem('app-direction') || 'rtl';

// ============================================
// DEFAULT BUTTON / PRIMARY COLOR
// Per-tenant override via the VITE_PRIMARY_COLOR env var (set in .env);
// falls back to the template red. Drives palette.primary + button hover.
// ============================================
export const DEFAULT_BUTTON_COLOR = import.meta.env.VITE_PRIMARY_COLOR || '#00ADB4';
const PRIMARY_HOVER = darken(DEFAULT_BUTTON_COLOR, 0.2);

// ============================================
// UNUSED EXPORTS - Commented out for future reference
// These are now managed by DirectionContext
// ============================================
// Create RTL cache for Emotion (powers MUI styling)
// export const cacheRtl = createCache({
//   key: 'muirtl',
//   stylisPlugins: [prefixer, rtlPlugin],
// });

// Create LTR cache (for switching if needed)
// export const cacheLtr = createCache({
//   key: 'muiltr',
//   stylisPlugins: [prefixer],
// });

// Get the appropriate cache based on direction
// export const emotionCache = APP_DIRECTION === 'rtl' ? cacheRtl : cacheLtr;

// ============================================
// MUI THEME CONFIGURATION
// Base theme imported by DirectionContext for dynamic direction support
// ============================================
export const theme = createTheme({
  direction: APP_DIRECTION,

  // Color palette - Centralized color definitions (Red theme)
  palette: {
    primary: {
      main: DEFAULT_BUTTON_COLOR,   // Primary actions / focus — overridable via VITE_PRIMARY_COLOR
      dark: PRIMARY_HOVER,          // Darker shade for hover states
      light: '#ff5757',             // Lighter red
      contrastText: '#fff',
    },
    error: {
      main: '#d32f2f',      // Clear red - For errors and validation
      dark: '#c62828',
      light: '#ef5350',
      contrastText: '#fff',
    },
    warning: {
      main: '#ed6c02',      // Orange - For warnings
      dark: '#e65100',
      light: '#ff9800',
      contrastText: '#fff',
    },
    success: {
      main: '#2e7d32',      // Green - For success states
      dark: '#1b5e20',
      light: '#4caf50',
      contrastText: '#fff',
    },
    info: {
      main: '#0288d1',      // Info blue
      dark: '#01579b',
      light: '#03a9f4',
      contrastText: '#fff',
    },
    dark: {
      main: '#000000',
      light: '#333333',
      dark: '#000000',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#7B1FA2',      // Purple - For awaiting/external action states
      dark: '#6A1B9A',
      light: '#9C27B0',
      contrastText: '#fff',
    },
    grey: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#eeeeee',
      300: '#e0e0e0',
      400: '#bdbdbd',
      500: '#9e9e9e',
      600: '#757575',
      700: '#616161',
      800: '#424242',
      900: '#212121',
    },
  },

  // RTL-specific component overrides + Enhanced Form UX
  components: {
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          '&:hover': {
            backgroundColor: PRIMARY_HOVER, // Darker shade of DEFAULT_BUTTON_COLOR
            color: '#ffffff',
          },
        },
        containedSecondary: {
          '&:hover': {
            backgroundColor: '#6A1B9A', // Darker purple for hover
            color: '#ffffff',
          },
        },
      },
    },
    // Enhanced TextField for clear visual states
    MuiTextField: {
      styleOverrides: {
        root: {
          // Default state - calm gray
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#bdbdbd', // Gray border
              borderWidth: '1px',
              transition: 'all 0.2s ease-in-out',
            },
            // Hover state - subtle indicator
            '&:hover fieldset': {
              borderColor: '#757575', // Darker gray
              borderWidth: '1px',
            },
            // Focus state - red (clear interaction)
            '&.Mui-focused fieldset': {
              borderColor: '#00ADB4', // Red border
              borderWidth: '2px',
              boxShadow: '0 0 0 3px rgba(255, 44, 44, 0.1)', // Red glow
            },
            // Error state - red (clear problem)
            '&.Mui-error fieldset': {
              borderColor: '#d32f2f', // Red border
              borderWidth: '2px',
            },
            // Error + Focus state - red takes priority
            '&.Mui-error.Mui-focused fieldset': {
              borderColor: '#d32f2f', // Red border
              borderWidth: '2px',
              boxShadow: '0 0 0 3px rgba(211, 47, 47, 0.1)', // Red glow
            },
          },
          // Success state (optional - for valid fields)
          '&.field-valid .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#2e7d32', // Green border
            },
            '&.Mui-focused fieldset': {
              borderColor: '#2e7d32',
              borderWidth: '2px',
              boxShadow: '0 0 0 3px rgba(46, 125, 50, 0.1)', // Green glow
            },
          },
        },
      },
    },
    // Enhanced Select for consistency
    MuiSelect: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00ADB4',
            borderWidth: '2px',
            boxShadow: '0 0 0 3px rgba(255, 44, 44, 0.1)',
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': {
            borderColor: '#d32f2f',
            borderWidth: '2px',
          },
        },
      },
    },
    // Form helper text colors
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          '&.Mui-error': {
            color: '#d32f2f', // Clear red for error messages
            fontWeight: 500,
          },
        },
      },
    },
    // Form labels
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: '#00ADB4', // Red when focused
            fontWeight: 500,
          },
          '&.Mui-error': {
            color: '#d32f2f', // Red when error
            fontWeight: 500,
          },
          '&.Mui-focused.Mui-error': {
            color: '#d32f2f', // Red takes priority
          },
        },
      },
    },
    // Drawer opens from right in RTL
    MuiDrawer: {
      defaultProps: {
        anchor: APP_DIRECTION === 'rtl' ? 'right' : 'left',
      },
    },
    // Tooltips show on left in RTL
    MuiTooltip: {
      defaultProps: {
        placement: APP_DIRECTION === 'rtl' ? 'left' : 'right',
      },
    },
  },
});
