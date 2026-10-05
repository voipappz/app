#!/usr/bin/env node
// Create a tenant through the API with the signed-in account's JWT, the way
// voipappz-api's `make tenant` does on the API host -- but from anywhere.
//
//   make tenant CUSTOMER=acme EMAIL=admin@acme.com [PASSWORD=...]
//   npm run tenant -- acme admin@acme.com [password]        (Windows)
//
// POST /api/customers with account_email/account_password runs the API's
// Customer::Init: the customer, its Account login, an environment, a user, a
// queue, services. Creating customers needs an account allowed to write
// customers (root). Run onboard first: the JWT comes from .env.token.
import fs from 'node:fs';
import crypto from 'node:crypto';

const [argName, argEmail, argPass] = process.argv.slice(2);
const name = (process.env.CUSTOMER || argName || '').trim();
const email = (process.env.EMAIL || argEmail || '').trim();
const password = process.env.PASSWORD || argPass || `Vpz-${crypto.randomBytes(6).toString('hex')}`;
if (!name || !email) {
  console.log('usage: make tenant CUSTOMER=<name> EMAIL=<admin@customer.com> [PASSWORD=...]');
  process.exit(1);
}

let cache;
try { cache = fs.readFileSync('.env.token', 'utf8').split(/\r?\n/); } catch { cache = []; }
const [who, token] = cache;
if (!token) { console.log('No login token: run make onboard (Windows: npm run onboard) first.'); process.exit(1); }
const [api, me] = who.split(' ');

const call = async (method, path, { form, bearer = token } = {}) => {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    body: form && new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
};

console.log(`Creating tenant '${name}' on ${api} as ${me} (takes a few seconds)...`);
const made = await call('POST', '/api/customers', {
  form: { name, enabled: 'true', account_email: email, account_password: password },
});
if (made.status === 403) {
  console.log(`${me} may not create customers on ${api}: that needs a root account.`);
  process.exit(1);
}
if (made.status >= 300) { console.log(`create failed (${made.status}): ${made.text}`); process.exit(1); }
if (made.json.init_error) {
  console.log(`customer created (${made.json.uuid}) but its setup failed: ${made.json.init_error}`);
  process.exit(1);
}

// Customer::Init gives every tenant's first user the same placeholder address;
// give this one its own, on the account's domain, so the User login is usable.
let userEmail = '';
const login = await call('POST', `/auth/login?${new URLSearchParams({ email, password })}`, { bearer: '' });
if (login.json.access) {
  const users = await call('GET', `/api/users?page=1&per_page=50`, { bearer: login.json.access });
  const list = Array.isArray(users.json) ? users.json : (users.json.data || users.json.users || []);
  const user = list.find((u) => u.environment_uuid === made.json.environment_uuid) || list[0];
  if (user) {
    userEmail = user.email;
    if (userEmail === 'test@cloud.voipappz.io') {
      const wanted = `user-${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}@${email.split('@')[1]}`;
      const upd = await call('PATCH', `/api/users/${user.uuid}`, { bearer: login.json.access, form: { email: wanted } });
      if (upd.status < 300) userEmail = wanted;
    }
  }
}

const port = process.env.PORT || 3000;
console.log(`
  Tenant '${name}' created on ${api}
    customer     ${made.json.uuid}
    environment  ${made.json.environment_uuid || '-'}

  Admin console  http://localhost:${port}/admin   Account  ${email}
  User portal    http://localhost:${port}/        User     ${userEmail || '(see Users in the console)'}
  Password       ${password}   (both logins)
`);
