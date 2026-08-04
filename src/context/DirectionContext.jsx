import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
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

/**
 * ForceLtr — render this and the WHOLE PAGE is left-to-right while it is
 * mounted, whatever the tenant's direction preference is. The login screen
 * uses it: sign-in is always LTR, even for a Hebrew/RTL tenant.
 *
 * It works by asking DirectionProvider to override the direction rather than
 * wrapping a subtree, because a subtree is not enough on two counts: the
 * emotion cache is flipped by stylis-plugin-rtl at the STYLESHEET level (so a
 * `dir` attribute reverts nothing), and MUI portals its overlays to
 * document.body, outside any wrapper. Overriding at the provider covers the
 * document, the cache, the theme and the portals in one move.
 *
 * The user's stored preference is untouched — it is restored the moment this
 * unmounts, i.e. as soon as they land in the authenticated app.
 *
 * useLayoutEffect, not useEffect: the override has to land before paint, or
 * the login page flashes RTL for a frame on a cold load.
 */
export const ForceLtr = ({ children }) => {
  const { forceDirection } = useDirection();

  useLayoutEffect(() => {
    forceDirection('ltr');
    return () => forceDirection(null);
  }, [forceDirection]);

  return children;
};

export const DirectionProvider = ({ children }) => {
  // Initialize direction from localStorage or default to 'rtl'
  const [direction, setDirection] = useState(() => {
    return localStorage.getItem('app-direction') || 'rtl';
  });

  // A screen that must render in a fixed direction regardless of preference
  // (the login page — see ForceLtr). null = follow the user's choice. This is
  // deliberately NOT persisted: it is a property of the screen, not a setting.
  const [forcedDirection, setForcedDirection] = useState(null);
  const forceDirection = useCallback((value) => setForcedDirection(value), []);

  // What the app actually renders with. Everything below keys off this, so the
  // override reaches the emotion cache, the theme and <html dir> together.
  const effectiveDirection = forcedDirection || direction;

  // Light/dark color scheme — persisted, exposed on <html data-theme> so plain
  // CSS (rail, drawers) can follow the MUI palette mode.
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem('app-color-mode');
    return stored === 'dark' ? 'dark' : 'light';
  });
  const toggleMode = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    localStorage.setItem('app-color-mode', next);
  };
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  // Create emotion cache based on direction
  const emotionCache = useMemo(() => {
    if (effectiveDirection === 'rtl') {
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
  }, [effectiveDirection]);

  // Create MUI theme by merging base theme with direction-specific overrides.
  // The tenant's brand colour (customer_portal_data.logo_color, e.g. MTN #080808)
  // drives palette.primary. Applied HERE rather than in muiTheme.js because that
  // module is evaluated at import time — before boot() fetches the portal data —
  // whereas this theme is built at render, once the data is cached.
  const theme = useMemo(() => {
    const brandColor = brand.color;
    return createTheme({
      ...baseMuiTheme,
      direction: effectiveDirection, // Override direction dynamically
      palette: {
        ...baseMuiTheme.palette,
        mode,
        // MUI light defaults come from the base theme; dark needs explicit
        // surfaces because the base palette pins light-only tokens.
        ...(mode === 'dark'
          ? {
              background: { default: '#0b1220', paper: '#111a2b' },
              text: { primary: '#e2e8f0', secondary: '#94a3b8' },
              divider: 'rgba(148, 163, 184, 0.2)',
            }
          : {}),
        ...(brandColor
          ? { primary: { ...baseMuiTheme.palette?.primary, main: brandColor } }
          : {}),
      },
      components: {
        ...baseMuiTheme.components,
        MuiDrawer: {
          ...baseMuiTheme.components?.MuiDrawer,
          defaultProps: {
            anchor: effectiveDirection === 'rtl' ? 'right' : 'left',
          },
        },
        MuiTooltip: {
          ...baseMuiTheme.components?.MuiTooltip,
          defaultProps: {
            placement: effectiveDirection === 'rtl' ? 'left' : 'right',
          },
        },
      },
    });
  }, [effectiveDirection, mode]);

  // Toggle direction function. Only records the PREFERENCE — the document is
  // synced by the effect below, from effectiveDirection, so a screen holding an
  // override (login) is not yanked out of it by a preference change.
  const toggleDirection = () => {
    const newDirection = direction === 'rtl' ? 'ltr' : 'rtl';
    setDirection(newDirection);
    localStorage.setItem('app-direction', newDirection);
  };

  // The ONE place <html dir|lang> is written — keyed off what actually renders.
  useEffect(() => {
    document.documentElement.dir = effectiveDirection;
    document.documentElement.lang = effectiveDirection === 'rtl' ? 'he' : 'en';
  }, [effectiveDirection]);

  // Set direction to specific value (for i18n integration)
  const setDirectionValue = (newDirection) => {
    if (newDirection !== direction) {
      setDirection(newDirection);
      localStorage.setItem('app-direction', newDirection);
    }
  };

  const value = {
    direction: effectiveDirection,
    forceDirection,
    toggleDirection,
    setDirection: setDirectionValue,
    isRTL: effectiveDirection === 'rtl',
    mode,
    toggleMode,
    isDark: mode === 'dark',
  };

  return (
    <DirectionContext.Provider value={value}>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </CacheProvider>
    </DirectionContext.Provider>
  );
};
