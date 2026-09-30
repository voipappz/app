/**
 * Sentry to Zendesk Integration
 *
 * Automatically creates Zendesk tickets for critical Sentry errors.
 * This ensures all production errors are tracked as support tickets.
 */

import { zendeskApi } from './api/zendeskApi';

// Track recently reported errors to avoid duplicates
const reportedErrors = new Map();
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a unique fingerprint for an error
 * @param {Object} event - Sentry event
 * @returns {string} Error fingerprint
 */
const getErrorFingerprint = (event) => {
  const { exception, message } = event;

  if (exception && exception.values && exception.values[0]) {
    const { type, value, stacktrace } = exception.values[0];
    // Use error type + message + first frame of stack
    const firstFrame = stacktrace?.frames?.[0];
    const frameInfo = firstFrame ? `${firstFrame.filename}:${firstFrame.lineno}` : '';
    return `${type}:${value}:${frameInfo}`;
  }

  return message || 'unknown';
};

/**
 * Check if error was recently reported
 * @param {string} fingerprint - Error fingerprint
 * @returns {boolean} True if recently reported
 */
const wasRecentlyReported = (fingerprint) => {
  const lastReported = reportedErrors.get(fingerprint);
  if (!lastReported) return false;

  const now = Date.now();
  if (now - lastReported > DUPLICATE_WINDOW_MS) {
    reportedErrors.delete(fingerprint);
    return false;
  }

  return true;
};

/**
 * Mark error as reported
 * @param {string} fingerprint - Error fingerprint
 */
const markAsReported = (fingerprint) => {
  reportedErrors.set(fingerprint, Date.now());
};

/**
 * Format Sentry error for Zendesk ticket
 * @param {Object} event - Sentry event
 * @returns {Object} Formatted ticket data
 */
const formatTicketFromSentryEvent = (event) => {
  const { exception, message, level, user, tags, contexts } = event;

  // Build error title
  let errorTitle = 'Application Error';
  if (exception && exception.values && exception.values[0]) {
    const { type, value } = exception.values[0];
    errorTitle = `${type}: ${value}`;
  } else if (message) {
    errorTitle = message;
  }

  // Truncate title if too long
  if (errorTitle.length > 100) {
    errorTitle = errorTitle.substring(0, 97) + '...';
  }

  // Build detailed description
  let description = '**Automated Error Report from Sentry**\n\n';
  description += `**Error:** ${errorTitle}\n`;
  description += `**Severity:** ${level || 'error'}\n`;
  description += `**Environment:** ${event.environment || 'unknown'}\n`;
  description += `**Timestamp:** ${new Date(event.timestamp * 1000).toISOString()}\n\n`;

  // Add user context
  if (user) {
    description += '**User Context:**\n';
    if (user.email) description += `- Email: ${user.email}\n`;
    if (user.id) description += `- ID: ${user.id}\n`;
    if (user.username) description += `- Username: ${user.username}\n`;
    description += '\n';
  }

  // Add tags
  if (tags && Object.keys(tags).length > 0) {
    description += '**Tags:**\n';
    Object.entries(tags).forEach(([key, value]) => {
      description += `- ${key}: ${value}\n`;
    });
    description += '\n';
  }

  // Add stack trace (truncated)
  if (exception && exception.values && exception.values[0]) {
    const { stacktrace } = exception.values[0];
    if (stacktrace && stacktrace.frames) {
      description += '**Stack Trace (top 5 frames):**\n```\n';
      const frames = stacktrace.frames.slice(0, 5);
      frames.forEach((frame) => {
        description += `${frame.filename}:${frame.lineno} in ${frame.function || 'anonymous'}\n`;
      });
      description += '```\n\n';
    }
  }

  // Add browser context
  if (contexts?.browser) {
    description += '**Browser:**\n';
    description += `- Name: ${contexts.browser.name}\n`;
    description += `- Version: ${contexts.browser.version}\n\n`;
  }

  // Add Sentry event ID for reference
  description += `**Sentry Event ID:** ${event.event_id}\n`;
  description += `**View in Sentry:** https://sentry.io/organizations/your-org/issues/?query=${event.event_id}`;

  // Determine priority based on error level
  let priority;
  if (level === 'fatal' || level === 'error') {
    priority = 'high';
  } else if (level === 'warning') {
    priority = 'normal';
  } else {
    priority = 'low';
  }

  return {
    subject: `[Sentry] ${errorTitle}`,
    description,
    priority,
    customer_uuid: user?.customer_uuid || tags?.customer_uuid,
    account_email: user?.email,
    tags: ['sentry', 'automated', `level:${level}`],
  };
};

/**
 * Create Zendesk ticket from Sentry error
 * @param {Object} event - Sentry event
 * @returns {Promise<void>}
 */
export const createZendeskTicketFromSentryError = async (event) => {
  try {
    // Only create Zendesk tickets in production builds
    if (typeof import.meta !== 'undefined' && import.meta.env && !import.meta.env.PROD) {
      return;
    }

    // Check if Zendesk is configured
    if (!zendeskApi.isConfigured()) {
      console.log('[Sentry->Zendesk] Zendesk not configured, skipping ticket creation');
      return;
    }

    // Only create tickets for errors and fatal issues
    const { level } = event;
    if (level !== 'error' && level !== 'fatal') {
      return;
    }

    // Check for duplicates
    const fingerprint = getErrorFingerprint(event);
    if (wasRecentlyReported(fingerprint)) {
      console.log('[Sentry->Zendesk] Duplicate error detected, skipping ticket');
      return;
    }

    // Format and create ticket
    const ticketData = formatTicketFromSentryEvent(event);
    console.log('[Sentry->Zendesk] Creating ticket for error:', ticketData.subject);

    await zendeskApi.createTicket(ticketData);
    markAsReported(fingerprint);

    console.log('[Sentry->Zendesk] Ticket created successfully');
  } catch (error) {
    // Don't let ticket creation errors break error reporting
    console.error('[Sentry->Zendesk] Failed to create ticket:', error);
  }
};

/**
 * Sentry beforeSend hook
 * Intercepts all Sentry events and creates Zendesk tickets for critical errors
 *
 * Usage: Add this to Sentry.init() configuration
 * ```
 * Sentry.init({
 *   beforeSend: sentryBeforeSend,
 *   // ... other options
 * });
 * ```
 *
 * @param {Object} event - Sentry event
 * @param {Object} hint - Sentry hint with original exception
 * @returns {Object} Modified event (or null to discard)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const sentryBeforeSend = (event, hint) => {
  // Create Zendesk ticket asynchronously (don't block error reporting)
  createZendeskTicketFromSentryError(event).catch((error) => {
    console.error('[Sentry->Zendesk] Error in beforeSend hook:', error);
  });

  // Always return the event to continue normal Sentry reporting
  return event;
};

export default {
  createZendeskTicketFromSentryError,
  sentryBeforeSend,
};
