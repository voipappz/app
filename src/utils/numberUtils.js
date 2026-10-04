// src/utils/numberUtils.js
//
// Number formatting, in one place, for the same reason as dateUtils: call
// sites were variously pinned to 'en-US', to no locale, or to a bare
// .toLocaleString(), so the same value was grouped differently depending on
// the screen. eslint.config.js warns on raw Intl outside src/utils/.

import { currentLocaleTag } from './dateUtils';

/**
 * A number, grouped for the active locale.
 *
 * English keeps today's output exactly: 'en-US' and 'en-GB' group and
 * decimalise identically (1,234.5), so moving the existing call sites here
 * changes nothing visible. he-IL also uses ',' and '.' with Western digits,
 * so Hebrew matches too — the win is consistency, not a visible difference.
 *
 * @param {number} value
 * @param {Intl.NumberFormatOptions} [options]
 */
export const formatNumber = (value, options) =>
  new Intl.NumberFormat(currentLocaleTag(), options).format(Number(value) || 0);

// NOT here yet, on purpose: a formatCurrency().
//
// Subscriptions renders prices as `${price} ${currency}` -> "10 USD", with no
// grouping separator, no symbol, and — under RTL — the amount and the currency
// in the wrong order, because string concatenation has no bidi awareness.
// Intl.NumberFormat with style:'currency' fixes all three, but it also changes
// what English shows ("10 USD" -> "$10.00"), which is a product decision
// rather than a refactor. It wants its own commit and someone's sign-off.
