#!/usr/bin/env node
/**
 * Playwright screenshot capture for Zendesk articles.
 *
 * 1. Logs in via 2-step OTP to cloud.voipappz.io
 * 2. Navigates to each admin screen, waits for load
 * 3. Captures full-page PNG screenshots to docs/screenshots/
 * 4. (Optional) Uploads to Zendesk article attachments and patches article body
 *
 * Prerequisites:
 *   npm i playwright  (or npx playwright install chromium)
 *
 * Usage:
 *   node docs/capture-screenshots.cjs                  # capture only
 *   node docs/capture-screenshots.cjs --upload          # capture + upload to Zendesk
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = process.env.VITE_API_BASE_URL || 'https://cloud.voipappz.io';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const OTP = process.env.VA_TEST_OTP;

if (!EMAIL || !PASSWORD || !OTP) {
  throw new Error('TEST_EMAIL, TEST_PASSWORD and VA_TEST_OTP must be set (see .env.example)');
}

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Screen name → { route, articleId (from articles-manifest.json) }
const SCREENS = [
  { name: 'live',          route: '/live',          articleId: 34576849928210 },
  { name: 'dashboard',     route: '/dashboard',     articleId: 34576849917714 },
  { name: 'calls',         route: '/calls',         articleId: 34576854082834 },
  { name: 'reports',       route: '/reports',        articleId: 34576849957906 },
  { name: 'dids',          route: '/dids',           articleId: 34576853404818 },
  { name: 'extensions',    route: '/extensions',     articleId: 34576853826450 },
  { name: 'users',         route: '/users',          articleId: 34576853338130 },
  { name: 'accounts',      route: '/accounts',       articleId: 34576849262226 },
  { name: 'bots',          route: '/bots',           articleId: 34576849827730 },
  { name: 'workflow',      route: '/workflow',        articleId: 34576849876498 },
  { name: 'campaigns',     route: '/campaigns',      articleId: null },
  { name: 'subscriptions', route: '/subscriptions',  articleId: 34576854133522 },
  { name: 'providers',     route: '/providers',      articleId: 34576850031890 },
  { name: 'messages',      route: '/messages',       articleId: null },
  { name: 'schema',        route: '/schema',         articleId: null },
  { name: 'events',        route: '/events',         articleId: null },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page) {
  console.log('  Step 1: POST /auth/login ...');
  const loginResp = await page.request.post(
    `${API_BASE}/auth/login?email=${encodeURIComponent(EMAIL)}&password=${encodeURIComponent(PASSWORD)}`
  );
  const loginData = await loginResp.json();
  if (!loginData.temp_token) throw new Error('Login failed: ' + JSON.stringify(loginData));

  console.log('  Step 2: POST /auth/otp/verify ...');
  const otpResp = await page.request.post(
    `${API_BASE}/auth/otp/verify?temp_token=${encodeURIComponent(loginData.temp_token)}&code=${OTP}&email=${encodeURIComponent(EMAIL)}&password=${encodeURIComponent(PASSWORD)}`
  );
  const tokens = await otpResp.json();
  if (!tokens.access) throw new Error('OTP verify failed: ' + JSON.stringify(tokens));

  // Inject tokens into localStorage so the SPA picks them up
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('auth', JSON.stringify(t));
  }, tokens);

  console.log('  Logged in successfully.\n');
  return tokens;
}

async function captureScreen(page, screen) {
  const url = `${APP_URL}${screen.route}`;
  console.log(`  Navigating to ${screen.name} (${url}) ...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for network idle (data loaded) with a reasonable timeout
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    console.log(`    (networkidle timed out for ${screen.name}, proceeding)`);
  }

  // Extra settle time for animations
  await page.waitForTimeout(1500);

  const filePath = path.join(SCREENSHOT_DIR, `${screen.name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`    Saved: ${filePath}`);
  return filePath;
}

async function uploadToZendesk(articleId, filePath, fileName) {
  const { uploadAttachment, updateArticle } = require('./zendesk-api.cjs');
  const attachment = await uploadAttachment(articleId, filePath, fileName);
  // Append screenshot to article body
  const imgTag = `<p><img src="${attachment.content_url}" alt="${fileName}" /></p>`;
  // We fetch current body, append, and update
  const { listArticles } = require('./zendesk-api.cjs');
  // Use direct API fetch for the single article
  const BASE = 'https://voipappz.zendesk.com/api/v2/help_center';
  // Credentials come from the environment, never the repo (it is public):
  // ZENDESK_EMAIL and ZENDESK_API_TOKEN.
  const AUTH = 'Basic ' + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString('base64');
  const res = await fetch(`${BASE}/en-us/articles/${articleId}.json`, {
    headers: { 'Authorization': AUTH }
  });
  const data = await res.json();
  const currentBody = data.article?.body || '';
  await updateArticle(articleId, { body: currentBody + '\n' + imgTag });
  console.log(`    Uploaded and embedded in article ${articleId}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const doUpload = process.argv.includes('--upload');

  // Ensure screenshot directory exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('=== Screenshot Capture ===\n');
  console.log(`App URL:  ${APP_URL}`);
  console.log(`API Base: ${API_BASE}`);
  console.log(`Upload:   ${doUpload ? 'YES' : 'NO (use --upload to enable)'}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // Login
    console.log('Logging in...');
    await login(page);

    // Capture each screen
    for (const screen of SCREENS) {
      try {
        const filePath = await captureScreen(page, screen);

        if (doUpload && screen.articleId) {
          await uploadToZendesk(screen.articleId, filePath, `${screen.name}.png`);
        }
      } catch (err) {
        console.error(`    ERROR capturing ${screen.name}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
