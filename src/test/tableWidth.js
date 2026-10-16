// jsdom lays nothing out, so a spec judges whether a column set fits a
// viewport by budget: a column with a fixed `width` costs that; any other
// costs its widest no-wrap text (header or sample cell) at about 7px a
// character, or its buttons at 34px each, plus the cell padding, and never
// less than one word of a text column.
const CHAR_WIDTH = 7;
const BUTTON_WIDTH = 34;
const CELL_PADDING = 20;
const MIN_TEXT_COLUMN = 80;

const textWidth = (cell) => cell.textContent.trim().length * CHAR_WIDTH;
const buttonsWidth = (cell) => cell.querySelectorAll('button').length * BUTTON_WIDTH;

// The width, in px, a rendered desktop table (its `table` element) needs.
export const widthNeeded = (table, columns) => {
  const headers = Array.from(table.querySelectorAll('thead th'));
  const cells = Array.from(table.querySelectorAll('tbody tr:first-child td'));
  return columns.reduce((sum, column, index) => {
    if (column.width) return sum + column.width;
    const widest = Math.max(
      textWidth(headers[index]),
      textWidth(cells[index]),
      buttonsWidth(cells[index]),
    );
    return sum + Math.max(MIN_TEXT_COLUMN, widest + CELL_PADDING);
  }, 0);
};
