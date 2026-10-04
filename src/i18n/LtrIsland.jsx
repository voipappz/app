import { useMemo } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import { ThemeProvider } from '@mui/material/styles';
import Box from '@mui/material/Box';
import { createAppTheme } from '../theme/theme';

// One cache for every island on the page — they all want the same thing, and
// building one per mount would re-insert the same rules repeatedly.
// `prefixer` is listed explicitly because passing `stylisPlugins` REPLACES
// Emotion's defaults; omit it and every vendor prefix silently disappears.
const ltrCache = createCache({ key: 'mui-ltr', stylisPlugins: [prefixer] });
const ltrTheme = createAppTheme('ltr');

/**
 * LtrIsland — a subtree that stays left-to-right while the app is RTL.
 *
 * Some things are not prose and must not mirror:
 *
 *  - time-series charts, where the x-axis runs earlier→later left→right by
 *    convention in every locale (recharts has no RTL handling of its own);
 *  - the React Flow canvases (PBXRouting, Workflows), whose node positions and
 *    edge paths are computed geometry, not text;
 *  - code and log viewers (Monaco, RawLogViewer), where lines are LTR syntax.
 *
 * All three layers below are needed, and each fixes a different thing:
 *
 *  - `dir="ltr"` on the wrapper governs native bidi and anything styled by a
 *    plain .css file, which Emotion never sees;
 *  - the LTR Emotion cache stops stylis-plugin-rtl mirroring rules generated
 *    inside;
 *  - the LTR theme stops MUI components inside flipping their own layout.
 *
 * Dark mode survives in here, which is not obvious: the theme is built with
 * `cssVariables` keyed on `[data-theme]`, so the palette comes from CSS
 * variables on <html> rather than through React context. An island therefore
 * re-declares direction without re-declaring colour.
 *
 *   <LtrIsland sx={{ height: 320 }}>
 *     <ResponsiveContainer>…</ResponsiveContainer>
 *   </LtrIsland>
 */
const LtrIsland = ({ children, sx, ...rest }) => {
  // `textAlign: start` rather than `left`: inside an LTR island start IS left,
  // and it keeps the rule correct if the wrapper is ever reused elsewhere.
  const boxSx = useMemo(() => ({ textAlign: 'start', ...sx }), [sx]);

  return (
    <CacheProvider value={ltrCache}>
      <ThemeProvider theme={ltrTheme}>
        <Box dir="ltr" sx={boxSx} {...rest}>{children}</Box>
      </ThemeProvider>
    </CacheProvider>
  );
};

export default LtrIsland;
