/**
 * Tour Definitions
 *
 * Defines onboarding tours for the application.
 * Each tour has a unique ID, name, and array of steps.
 *
 * Step Properties:
 * - id: Unique step identifier
 * - selector: CSS selector for the target element (use data-tour="..." attributes)
 * - the step's title and description are in the `tour` namespace
 *   (src/i18n/locales/<language>/tour.json), under <tour id>.steps.<step id>
 * - position: Tooltip position (top, bottom, left, right)
 * - optional: If true, step can be skipped if element not found
 */

export const TOURS = {
  'first-login': {
    id: 'first-login',
    name: 'Welcome to VoIP Admin',
    autoStart: true, // Auto-trigger on first login
    steps: [
      {
        id: 'welcome',
        selector: '[data-tour="welcome"]',
        position: 'center',
        optional: true,
      },
      {
        id: 'env-selector',
        selector: '[data-tour="env-selector"]',
        position: 'bottom',
        optional: false,
      },
      {
        id: 'users-menu',
        selector: '[data-tour="users-menu"]',
        position: 'right',
        optional: true,
      },
      {
        id: 'dids-menu',
        selector: '[data-tour="dids-menu"]',
        position: 'right',
        optional: true,
      },
      {
        id: 'subscriptions-menu',
        selector: '[data-tour="subscriptions-menu"]',
        position: 'right',
        optional: true,
      },
      {
        id: 'tour-complete',
        selector: '[data-tour="welcome"]',
        position: 'center',
        optional: true,
      },
    ],
  },

  'dids-guide': {
    id: 'dids-guide',
    name: 'Route Management Guide',
    autoStart: false,
    steps: [
      {
        id: 'did-list',
        selector: '[data-tour="did-list"]',
        position: 'left',
        optional: true,
      },
      {
        id: 'did-create',
        selector: '[data-tour="did-create"]',
        position: 'bottom',
        optional: true,
      },
      {
        id: 'did-bridge',
        selector: '[data-tour="did-bridge"]',
        position: 'right',
        optional: true,
      },
    ],
  },

  'devzone-guide': {
    id: 'devzone-guide',
    name: 'Developer Zone Guide',
    autoStart: false,
    steps: [
      {
        id: 'devzone-overview',
        selector: '[data-tour="devzone-hero"]',
        position: 'bottom',
        optional: false,
      },
      {
        id: 'devzone-connect-mcp',
        selector: '[data-tour="devzone-mcp"]',
        position: 'bottom',
        optional: false,
      },
      {
        id: 'devzone-navigation',
        selector: '[data-tour="devzone-tabs"]',
        position: 'bottom',
        optional: false,
      },
    ],
  },

  'quick-actions': {
    id: 'quick-actions',
    name: 'Quick Actions Guide',
    autoStart: false,
    steps: [
      {
        id: 'help-button',
        selector: '[data-tour="help-button"]',
        position: 'bottom',
        optional: true,
      },
      {
        id: 'refresh-button',
        selector: '[data-tour="refresh-button"]',
        position: 'bottom',
        optional: true,
      },
    ],
  },
};

/**
 * Get a tour by ID
 * @param {string} tourId - The tour ID
 * @returns {object|null} The tour definition or null if not found
 */
export const getTour = (tourId) => {
  return TOURS[tourId] || null;
};

/**
 * Get all tours that should auto-start
 * @returns {string[]} Array of tour IDs that should auto-start
 */
export const getAutoStartTours = () => {
  return Object.values(TOURS)
    .filter((tour) => tour.autoStart)
    .map((tour) => tour.id);
};

export default TOURS;
