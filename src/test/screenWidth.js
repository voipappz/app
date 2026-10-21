// Answers media queries as a screen of `width` px would, so a spec can check
// the in-between sizes (a tablet, a small laptop), not only phone or desktop.
// Understands the min-width / max-width queries MUI's breakpoints write.
// Call the returned function to go back to the default test screen.
const matchesWidth = (query, width) => {
  const min = query.match(/min-width:\s*([\d.]+)px/);
  const max = query.match(/max-width:\s*([\d.]+)px/);
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
};

export const pretendScreenWidth = (width) => {
  window.matchMedia = (query) => ({
    matches: matchesWidth(query, width), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  });
  return () => { delete window.matchMedia; };
};
