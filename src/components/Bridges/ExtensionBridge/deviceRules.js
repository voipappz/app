// A device's rules, shared by the device form (ExtensionBridge) and the CSV
// import (Extensions → Import), so a row the importer accepts is one the form
// would have accepted. The API applies the same rules (Mediators::Device::Import).

export const DEVICE_CSV_HEADERS = ['Username', 'Name', 'Password', 'CallerID'];

const PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateDevicePassword(length = 12) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => PASSWORD_CHARS[v % PASSWORD_CHARS.length]).join('');
}

// The form's messages, field by field; empty when the device is valid.
export function deviceErrors({ name, username, password } = {}, { requirePassword = true } = {}) {
  const errors = {};
  if (!String(name ?? '').trim()) errors.name = 'Name is required';
  if (!String(username ?? '').trim()) errors.username = 'Device number is required';
  if (requirePassword && !String(password ?? '').trim()) errors.password = 'Password is required for new devices';
  return errors;
}

// The same rules for a CSV row, keyed by its column.
export function deviceRowErrors(row = {}) {
  const errors = deviceErrors({ name: row.Name, username: row.Username, password: row.Password });
  const byColumn = {};
  if (errors.username) byColumn.Username = errors.username;
  if (errors.name) byColumn.Name = errors.name;
  if (errors.password) byColumn.Password = errors.password;
  return byColumn;
}

// A new device gets a generated password, as the form does.
export const prepareDeviceRow = (row = {}) => (String(row.Password ?? '').trim()
  ? row : { ...row, Password: generateDevicePassword() });

const FIRST_NAMES = ['Maya', 'Yoni', 'Noa', 'Omer', 'Tamar', 'Itai', 'Shira', 'Amit', 'Lior', 'Dana', 'Eitan', 'Roni', 'Gal', 'Yael', 'Nadav', 'Michal'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const digits = (count) => Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join('');

// Example rows for the import template: different on every open, so nobody
// imports the example by accident as if it were real data.
export function randomDeviceRows(count = 3) {
  const start = 200 + Math.floor(Math.random() * 7000);
  const callerId = `0${pick(['2', '3', '4', '8', '9'])}-${digits(7)}`;
  return Array.from({ length: count }, (_, i) => ({
    Username: String(start + i),
    Name: pick(FIRST_NAMES),
    Password: generateDevicePassword(),
    CallerID: callerId,
  }));
}
