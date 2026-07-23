import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CacheProvider } from '@emotion/react';
import { createTheme } from '@mui/material/styles';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import createCache from '@emotion/cache';
import { theme as baseMuiTheme } from '../theme/muiTheme';
import { brand } from '../config';

const DirectionContext = createContext();

export const useDirection = () => {
  const context = useContext(DirectionContext);
  if (!context) {
    throw new Error('useDirection must be used within DirectionProvider');
  }
  return context;
};

export const DirectionProvider = ({ children }) => {
  // Initialize direction from localStorage or default to 'rtl'
  const [direction, setDirection] = useState(() => {
    return localStorage.getItem('app-direction') || 'rtl';
  });

  // Create emotion cache based on direction
  const emotionCache = useMemo(() => {
    if (direction === 'rtl') {
      return createCache({
        key: 'muirtl',
        stylisPlugins: [prefixer, rtlPlugin],
      });
    } else {
      return createCache({
        key: 'muiltr',
        stylisPlugins: [prefixer],
      });
    }
  }, [direction]);

  // Create MUI theme by merging base theme with direction-specific overrides.
  // The tenant's brand colour (customer_portal_data.logo_color, e.g. MTN #080808)
  // drives palette.primary. Applied HERE rather than in muiTheme.js because that
  // module is evaluated at import time — before boot() fetches the portal data —
  // whereas this theme is built at render, once the data is cached.
  const theme = useMemo(() => {
    const brandColor = brand.color;
    return createTheme({
      ...baseMuiTheme,
      direction: direction, // Override direction dynamically
      palette: {
        ...baseMuiTheme.palette,
        ...(brandColor
          ? { primary: { ...baseMuiTheme.palette?.primary, main: brandColor } }
          : {}),
      },
      components: {
        ...baseMuiTheme.components,
        MuiDrawer: {
          ...baseMuiTheme.components?.MuiDrawer,
          defaultProps: {
            anchor: direction === 'rtl' ? 'right' : 'left',
          },
        },
        MuiTooltip: {
          ...baseMuiTheme.components?.MuiTooltip,
          defaultProps: {
            placement: direction === 'rtl' ? 'left' : 'right',
          },
        },
      },
    });
  }, [direction]);

  // Toggle direction function
  const toggleDirection = () => {
    const newDirection = direction === 'rtl' ? 'ltr' : 'rtl';
    setDirection(newDirection);
    localStorage.setItem('app-direction', newDirection);
    // Update document direction
    document.documentElement.dir = newDirection;
    document.documentElement.lang = newDirection === 'rtl' ? 'he' : 'en';
  };

  // Sync document direction on mount and direction change
  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = direction === 'rtl' ? 'he' : 'en';
  }, [direction]);

  // Set direction to specific value (for i18n integration)
  const setDirectionValue = (newDirection) => {
    if (newDirection !== direction) {
      setDirection(newDirection);
      localStorage.setItem('app-direction', newDirection);
      document.documentElement.dir = newDirection;
      document.documentElement.lang = newDirection === 'rtl' ? 'he' : 'en';
    }
  };

  const value = {
    direction,
    toggleDirection,
    setDirection: setDirectionValue,
    isRTL: direction === 'rtl',
  };

  return (
    <DirectionContext.Provider value={value}>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          {children}
        </ThemeProvider>
      </CacheProvider>
    </DirectionContext.Provider>
  );
};
