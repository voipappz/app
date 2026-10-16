// Every CSS rule on the test page, whitespace around punctuation removed, so a
// spec can look for what an `sx` produced (`padding:6px 10px`). Emotion either
// appends the text to its style tags or, in its production build, inserts the
// rules straight into the sheet; this reads both.
export const styledCss = () => {
  const fromTags = Array.from(document.querySelectorAll('style')).map((style) => style.textContent);
  const fromSheets = Array.from(document.styleSheets).flatMap((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText); } catch { return []; }
  });
  return [...fromTags, ...fromSheets].join('\n').replace(/\s*([:;{}])\s*/g, '$1');
};
