import { useMemo } from 'react';
import { ThemeProvider, useTheme } from '@mui/material/styles';

/**
 * The content of a raised layer (the phone drawer, the call dock): MUI's
 * menus, popovers and tooltips read their z-index from the theme, so inside
 * this they open at `layer` instead of behind the layer they belong to.
 *   <PopupLayer layer={Z.PHONE_POPUP}>...</PopupLayer>
 */
export default function PopupLayer({ layer, children }) {
  const outer = useTheme(); // MUI's default theme where the app gives none
  const theme = useMemo(
    () => ({ ...outer, zIndex: { ...outer.zIndex, modal: layer, tooltip: layer } }),
    [outer, layer],
  );
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
