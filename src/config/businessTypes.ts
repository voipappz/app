/**
 * Business Types Configuration
 * Single source of truth for all business type options.
 *
 * To add a new business type:
 * 1. Add entry here with Hebrew value and translation key
 * 2. Add translations in he.json and en.json under customers.businessInfo.businessTypeOptions
 */

export const BUSINESS_TYPES = [
  { value: 'עוסק מורשה', translationKey: 'licensed' },
  { value: 'חברה בע״מ', translationKey: 'company' },
  { value: 'עמותה', translationKey: 'association' },
  { value: 'דרכון', translationKey: 'passport' },
] as const;

/** Type for valid business type values (Hebrew strings stored in DB) */
export type BusinessTypeValue = typeof BUSINESS_TYPES[number]['value'];

/** Default business type for new customers */
export const DEFAULT_BUSINESS_TYPE: BusinessTypeValue = 'עוסק מורשה';
