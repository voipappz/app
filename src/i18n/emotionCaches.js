import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

// Left-to-right uses the same key as Emotion's default cache, so class names
// in English stay exactly as they were.
export const ltrCache = createCache({ key: 'css' });

// Right-to-left mirrors every MUI/Emotion style (margin-left -> margin-right...).
// Passing stylisPlugins replaces Emotion's defaults, so prefixer is listed again.
// stylis is pinned to 4.2.0 in package.json, the copy Emotion itself uses: a
// second copy made Emotion throw on every style and the app remount in a loop.
export const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });
