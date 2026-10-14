// A number kept left to right inside a translated sentence (the text form of
// <Bdi>): "Call \u2066201\u2069" reads correctly in Hebrew.
export const isolated = (text) => `\u2066${text}\u2069`;
