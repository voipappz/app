import { describe, it, expect } from 'vitest';
import { rowPrimarySx, rowSecondarySx, rowNumberSx, summaryLabelSx, summaryValueSx } from './sessionRowStyles';

// The values the Calls screen uses for its rows (Calls.jsx grid cells and
// CallLogRow), copied so both lists read alike.
describe('sessionRowStyles', () => {
  it('sets the primary text like a Calls row: 12px, weight 500, primary colour', () => {
    expect(rowPrimarySx).toMatchObject({ fontSize: '12px', fontWeight: 500, color: 'text.primary' });
  });

  it('sets secondary text in the secondary colour and numbers left to right', () => {
    expect(rowSecondarySx).toMatchObject({ fontSize: '12px', color: 'text.secondary' });
    expect(rowNumberSx).toMatchObject({ direction: 'ltr', fontVariantNumeric: 'tabular-nums' });
  });

  it('labels the summary strip like the grid headers and values like its cells', () => {
    expect(summaryLabelSx).toMatchObject({ fontSize: '11px', fontWeight: 700 });
    expect(summaryValueSx).toMatchObject({ fontSize: '12px' });
  });
});
