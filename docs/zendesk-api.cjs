/**
 * Zendesk Help Center API client
 * Handles all CRUD operations for categories, sections, and articles.
 */

const BASE = 'https://voipappz.zendesk.com/api/v2/help_center';
// Credentials come from the environment, never the repo (it is public):
// ZENDESK_EMAIL and ZENDESK_API_TOKEN.
if (!process.env.ZENDESK_EMAIL || !process.env.ZENDESK_API_TOKEN) {
  throw new Error('Set ZENDESK_EMAIL and ZENDESK_API_TOKEN');
}
const AUTH = 'Basic ' + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString('base64');
const LOCALE = 'en-us';

const headers = {
  'Authorization': AUTH,
  'Content-Type': 'application/json',
};

async function apiCall(method, path, body = null) {
  const url = path.startsWith('http') ? path : `${BASE}/${path}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  if (res.status === 429) {
    const retry = parseInt(res.headers.get('retry-after') || '10', 10);
    console.log(`  Rate limited, waiting ${retry}s...`);
    await sleep(retry * 1000);
    return apiCall(method, path, body);
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Zendesk API ${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Throttle to respect Zendesk rate limits (avoid 429s)
let lastCall = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < 500) await sleep(500 - elapsed);
  lastCall = Date.now();
}

async function api(method, path, body) {
  await throttle();
  return apiCall(method, path, body);
}

// --- Categories ---

async function listCategories() {
  const data = await api('GET', `${LOCALE}/categories.json`);
  return data.categories;
}

async function createCategory(name, description = '', position = null) {
  const cat = { name, description };
  if (position !== null) cat.position = position;
  const data = await api('POST', `${LOCALE}/categories.json`, { category: cat });
  console.log(`  Created category: ${name} (${data.category.id})`);
  return data.category;
}

async function updateCategory(id, updates) {
  const data = await api('PUT', `${LOCALE}/categories/${id}.json`, { category: updates });
  return data.category;
}

async function deleteCategory(id) {
  await api('DELETE', `${LOCALE}/categories/${id}.json`);
  console.log(`  Deleted category: ${id}`);
}

// --- Sections ---

async function listSections(categoryId = null) {
  let path = categoryId
    ? `${LOCALE}/categories/${categoryId}/sections.json?per_page=100`
    : `${LOCALE}/sections.json?per_page=100`;
  const data = await api('GET', path);
  return data.sections;
}

async function createSection(categoryId, name, description = '', position = null) {
  const sec = { name, description, category_id: categoryId };
  if (position !== null) sec.position = position;
  const data = await api('POST', `${LOCALE}/categories/${categoryId}/sections.json`, { section: sec });
  console.log(`  Created section: ${name} (${data.section.id})`);
  return data.section;
}

async function updateSection(id, updates) {
  const data = await api('PUT', `${LOCALE}/sections/${id}.json`, { section: updates });
  return data.section;
}

async function deleteSection(id) {
  await api('DELETE', `${LOCALE}/sections/${id}.json`);
  console.log(`  Deleted section: ${id}`);
}

// --- Articles ---

async function listArticles(sectionId = null, page = 1) {
  let path = sectionId
    ? `${LOCALE}/sections/${sectionId}/articles.json?per_page=100&page=${page}`
    : `${LOCALE}/articles.json?per_page=100&page=${page}`;
  const data = await api('GET', path);
  return { articles: data.articles, count: data.count, next_page: data.next_page };
}

async function listAllArticles() {
  let all = [];
  let page = 1;
  while (true) {
    const { articles, next_page } = await listArticles(null, page);
    all = all.concat(articles);
    if (!next_page) break;
    page++;
  }
  return all;
}

async function createArticle(sectionId, title, body, draft = false) {
  const article = {
    title,
    body,
    draft,
    locale: LOCALE,
    comments_disabled: false,
    permission_group_id: 1207812,
    user_segment_id: null,
  };
  const data = await api('POST', `${LOCALE}/sections/${sectionId}/articles.json`, { article });
  const status = draft ? ' [DRAFT]' : '';
  console.log(`  Created article: ${title}${status} (${data.article.id})`);
  return data.article;
}

async function updateArticle(id, updates) {
  const data = await api('PUT', `${LOCALE}/articles/${id}.json`, { article: updates });
  return data.article;
}

async function deleteArticle(id) {
  await api('DELETE', `${LOCALE}/articles/${id}.json`);
  console.log(`  Deleted article: ${id}`);
}

async function moveArticle(id, sectionId) {
  return updateArticle(id, { section_id: sectionId });
}

// --- Upload attachment ---

async function uploadAttachment(articleId, filePath, fileName) {
  const fs = await import('fs');
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), fileName);

  await throttle();
  const res = await fetch(`${BASE}/articles/${articleId}/attachments.json`, {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      ...form.getHeaders(),
    },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  console.log(`  Uploaded: ${fileName} → ${data.article_attachment.content_url}`);
  return data.article_attachment;
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listSections, createSection, updateSection, deleteSection,
  listArticles, listAllArticles, createArticle, updateArticle, deleteArticle, moveArticle,
  uploadAttachment,
  sleep,
};
