// Makes every media query match, so useMediaQuery(down(...)) sees a phone.
// Call the returned function to go back to a desktop-sized test screen.
export const pretendPhoneScreen = () => {
  window.matchMedia = (query) => ({
    matches: true, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  });
  return () => { delete window.matchMedia; };
};
