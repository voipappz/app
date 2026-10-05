#!/usr/bin/env node
// Make sure there is a valid login token for the API before anything talks to
// it. Reuses the cached token (.env.token) while it is valid, signs in again
// otherwise. When a value is missing and a person is at the terminal, asks for
// it, and saves the answers to .env only once the login works.
// Values come from the environment first (CI), then from .env.
// TOKEN=1 prints the token. Node only, so it runs the same on Windows,
// macOS, Linux and in the dev container.
import fs from 'node:fs';
import readline from 'node:readline';

const ENV = '.env';
const CACHE = '.env.token';
const DEFAULT_API = 'https://switch.voipappz.io';
const interactive = process.stdin.isTTY && process.stdout.isTTY;

const readEnv = () => {
  const out = {};
  if (!fs.existsSync(ENV)) return out;
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
};
// Write KEY=value into .env, replacing the line if it is there.
const put = (key, value) => {
  const lines = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split(/\r?\n/) : [];
  const kept = lines.filter((l) => l && !l.startsWith(`${key}=`));
  fs.writeFileSync(ENV, [...kept, `${key}=${value}`].join('\n') + '\n');
};

// Where a login comes from: `make tenant` (this repo, through the API with a
// root login) or voipappz-api's `make tenant` on the API host. Both create a
// customer with an Account login (admin console) and a User login (portal).
const tenantHint = (lead) => {
  console.log(`${lead} Someone with a root login creates a tenant for you:`);
  console.log('    make tenant CUSTOMER=<name> EMAIL=<you@company.com>     (Windows: npm run tenant -- <name> <email>)');
  console.log('  It prints an Account login (admin console) and a User login (user portal).');
};

const ask = (question, hidden = false) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Echo nothing while the password is typed.
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(question); };
  }
  rl.question(question, (answer) => {
    rl.close();
    if (hidden) process.stdout.write('\n');
    resolve(answer.trim());
  });
});

// Seconds the JWT has left, from its own exp claim; 0 when it cannot be read.
const ttl = (jwt) => {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    return Math.max(0, Math.floor(payload.exp - Date.now() / 1000));
  } catch { return 0; }
};

const post = async (url) => {
  try {
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    try { return { json: JSON.parse(text), text }; } catch { return { json: {}, text }; }
  } catch (err) {
    return { json: {}, text: `no answer (${err.cause?.code || err.name})` };
  }
};

const fileEnv = readEnv();
const pick = (key) => process.env[key] || fileEnv[key] || '';
let api = pick('VITE_API_BASE_URL');
let email = pick('TEST_EMAIL');
let pass = pick('TEST_PASSWORD');
const otp = pick('VA_TEST_OTP');
if (api.includes('example.com')) api = '';
if (email === 'you@example.com') email = '';

const asked = {};
if ((!api || !email || !pass) && interactive) {
  console.log('\nSign in to the VoIPappz API (saved to .env once the login works; git ignores it)');
  tenantHint('  No login yet?');
  console.log();
  // Answers stay in memory; .env gets them only once the login works.
  if (!api) { api = (await ask(`  API address [${DEFAULT_API}]: `)) || DEFAULT_API; asked.VITE_API_BASE_URL = api; }
  if (!email) { email = await ask('  Email: '); asked.TEST_EMAIL = email; }
  if (!pass) { pass = await ask('  Password: ', true); asked.TEST_PASSWORD = pass; }
}
api = (api || DEFAULT_API).replace(/\/+$/, '');
if (!email || !pass) {
  console.log('Put TEST_EMAIL and TEST_PASSWORD in .env, or run onboard in a terminal to be asked');
  tenantHint('No login yet?');
  process.exit(1);
}

const done = (access) => {
  console.log(`token valid for ${api} as ${email}`);
  if (process.env.TOKEN) console.log(access);
  else if (process.stdout.isTTY) {
    const port = process.env.PORT || 3000;
    console.log();
    console.log(`  Admin console  http://localhost:${port}/admin   (Account login: ${email})`);
    console.log(`  User portal    http://localhost:${port}/        (User login, created in the console or by make tenant)`);
    console.log('  Start it with  make dev   (Windows: npm start)');
  }
  process.exit(0);
};

// The cache is reused only for the same API and email, with a minute to spare.
try {
  const [who, access] = fs.readFileSync(CACHE, 'utf8').split(/\r?\n/);
  if (who === `${api} ${email}` && ttl(access) > 60) done(access);
} catch { /* no cache, or one this user cannot read: sign in again */ }

fs.rmSync(CACHE, { force: true });
const q = (o) => new URLSearchParams(o).toString();
let resp = await post(`${api}/auth/login?${q({ email, password: pass })}`);
let access = resp.json.access;
// OTP is off by default; only when the API asks for it is VA_TEST_OTP used.
if (!access && resp.json.temp_token) {
  resp = await post(`${api}/auth/otp/verify?${q({ temp_token: resp.json.temp_token, code: otp, email, password: pass })}`);
  access = resp.json.access;
}
if (!access) {
  console.log(`login failed at ${api} for ${email}: ${resp.text || 'no answer'}`);
  process.exit(1);
}

// Signed in: now keep what the wizard asked for.
if (Object.keys(asked).length) {
  if (!fs.existsSync(ENV) && fs.existsSync('.env.example')) fs.copyFileSync('.env.example', ENV);
  for (const [k, v] of Object.entries(asked)) put(k, v);
}
fs.writeFileSync(CACHE, `${api} ${email}\n${access}\n`, { mode: 0o600 });
done(access);
