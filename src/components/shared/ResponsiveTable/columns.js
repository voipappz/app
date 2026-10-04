/**
 * The column descriptor.
 *
 * This is the piece the codebase was missing. Twenty-nine screens build a
 * table by hand -- <TableHead> with literal <TableCell> headers, <TableBody>
 * with inline cell expressions -- so there is nothing a shared component, a
 * codemod or a translation pass can get hold of. Describing a table as data
 * instead of markup is what makes all three possible.
 *
 *   {
 *     id:       'extension',                 // stable key; also the sort field
 *     label:    t('extensions:table.ext'),   // header text
 *     priority: 'primary',                   // what survives on a phone
 *     align:    'start',                     // 'start' | 'end' | 'center'
 *     render:   (row) => <Bdi>{row.ext}</Bdi>,
 *     sortable: true,
 *     width:    160,                         // desktop only, optional
 *   }
 *
 * `priority` is the only genuinely new idea. A phone cannot show twelve
 * columns, so each column says what it is FOR, and the card view lays them out
 * accordingly. That decision belongs to whoever knows the screen, which is why
 * it lives at the call site rather than being guessed from column order.
 */

/**
 * Where a column goes in the phone card:
 *
 *   primary      the headline — the thing you scan for. One, occasionally two.
 *   secondary    the subtitle under it.
 *   meta         a wrapped row of small label/value pairs.
 *   action       the card's footer (buttons, menus).
 *   desktopOnly  omitted from the card entirely.
 */
export const PRIORITIES = ['primary', 'secondary', 'meta', 'action', 'desktopOnly'];

export const DEFAULT_PRIORITY = 'meta';

/** `align: 'start' | 'end'` only — 'left'/'right' do not mirror under RTL. */
const ALIGN_TO_MUI = { start: 'left', end: 'right', center: 'center' };

/**
 * MUI's TableCell still wants physical left/right, so logical values are
 * translated here rather than at every call site. Under RTL the Emotion RTL
 * plugin flips the resulting CSS, so 'start' lands on the reading-start edge
 * either way.
 */
export const muiAlign = (align) => ALIGN_TO_MUI[align] || 'left';

/** Columns for a given priority, in the order the caller declared them. */
export const byPriority = (columns, priority) =>
  (columns || []).filter((c) => (c.priority || DEFAULT_PRIORITY) === priority);

/** Everything the card should show — i.e. not desktop-only. */
export const cardColumns = (columns) =>
  (columns || []).filter((c) => (c.priority || DEFAULT_PRIORITY) !== 'desktopOnly');

/**
 * A column's value for a row: its `render` if it has one, else `row[id]`.
 *
 * Deliberately does NOT apply orEmpty — a column that wants the muted em-dash
 * says so in its own render, because plenty of columns render a chip or a
 * button for which "empty" means something different.
 */
export const cellValue = (column, row) =>
  typeof column.render === 'function' ? column.render(row) : row?.[column.id];

/**
 * Throws on a malformed column list, in development only.
 *
 * Worth failing loudly: a typo in `priority` would otherwise silently drop the
 * column from every phone card, which is the kind of bug nobody notices until
 * a customer reports it.
 */
export const assertColumns = (columns) => {
  if (!import.meta.env?.DEV) return;
  if (!Array.isArray(columns)) throw new Error('ResponsiveTable: columns must be an array');
  const seen = new Set();
  columns.forEach((c, i) => {
    if (!c || typeof c.id !== 'string' || !c.id) {
      throw new Error(`ResponsiveTable: columns[${i}] needs a non-empty string id`);
    }
    if (seen.has(c.id)) throw new Error(`ResponsiveTable: duplicate column id "${c.id}"`);
    seen.add(c.id);
    if (c.priority && !PRIORITIES.includes(c.priority)) {
      throw new Error(
        `ResponsiveTable: column "${c.id}" has priority "${c.priority}"; expected one of ${PRIORITIES.join(', ')}`
      );
    }
  });
};
