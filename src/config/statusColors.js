/**
 * Status color mapping for Material-UI Chip components
 * Maps status values to MUI color palette names
 */

// fireberry_order_statuses:{
//   "1":"הצעת מחיר", //draft
//   "2":"סגור", //completed
//   "4":"נכשלה", //failed
//   "5":"לתיאום התקנה", //ready_for_scheduling
//   "8":"הכנה לתיאום התקנה", //prep_for_scheduling
//   "9":"ממתין לחתימת לקוח", //awaiting_customer_signature
//   "10":"ממתינה לסיום התקנה" // pending_installation
// }
const orderStatusColorMap = {
  // Order/Installation statuses
  draft: 'default',
  completed: 'success',
  failed: 'error',
  ready_for_scheduling: 'success',
  prep_for_scheduling: 'warning',
  awaiting_customer_signature: 'secondary',
  customer_signed: 'success',
  pending_installation: 'info',
  // Legacy statuses
  new: 'info',
  pending: 'warning',
  in_progress: 'primary',
  cancelled: 'error'
};

/**
 * Get the MUI color for a given status
 * @param {string} status - The status value
 * @returns {string} - MUI color name ('default', 'primary', 'secondary', 'error', 'info', 'success', 'warning')
 */
export function getStatusColor(status) {
  return orderStatusColorMap[status] || 'default';
}
