/**
 * Customer Service
 * Fetches customer portal data (logo, branding, etc.) from server
 */

import { config } from '../config.js';
import { titleForRole } from '../utils/sessionTitle';

const CUSTOMER_DATA_KEY = 'customerData';

const DEFAULT_CUSTOMER_DATA = {
  name: 'VoipAppz',
  language: 'en',
  logo_url: '',
  logo_icon: '',
  logo_title: 'VoipAppz',
  logo_color: '#65758E',
  url: '',
  url_login: '',
  favicon: '',
  small_icon: ''
};

function getAuthHeaders() {
  const storedAuth = localStorage.getItem('auth');
  if (storedAuth) {
    try {
      const authData = JSON.parse(storedAuth);
      return {
        'Authorization': authData.access ? `Bearer ${authData.access}` : '',
        'Content-Type': 'application/json',
      };
    } catch (e) {
      console.error('Failed to parse auth data:', e);
    }
  }
  return { 'Content-Type': 'application/json' };
}

export async function fetchCustomerPortalData() {
  try {
    const response = await fetch(`${config.baseUrl}/tasks/customer_portal_data`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch customer data: ${response.status}`);
    }

    const data = await response.json();

    const customerData = {
      name: data.name || DEFAULT_CUSTOMER_DATA.name,
      language: data.language || DEFAULT_CUSTOMER_DATA.language,
      logo_url: data.logo_url || data.url || DEFAULT_CUSTOMER_DATA.logo_url,
      logo_icon: data.logo_icon || data.favicon || DEFAULT_CUSTOMER_DATA.logo_icon,
      logo_title: data.logo_title || data.name || DEFAULT_CUSTOMER_DATA.logo_title,
      logo_color: data.logo_color || DEFAULT_CUSTOMER_DATA.logo_color,
      url: data.logo_url || data.url || DEFAULT_CUSTOMER_DATA.url,
      url_login: data.url_login || data.logo_url || DEFAULT_CUSTOMER_DATA.url_login,
      favicon: data.logo_icon || data.favicon || DEFAULT_CUSTOMER_DATA.favicon,
      small_icon: data.small_icon || data.logo_icon || DEFAULT_CUSTOMER_DATA.small_icon
    };

    localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(customerData));
    return customerData;
  } catch (error) {
    console.error('Failed to fetch customer portal data:', error);
    const cached = getCustomerData();
    if (cached) return cached;
    return DEFAULT_CUSTOMER_DATA;
  }
}

export function getCustomerData() {
  try {
    const cached = localStorage.getItem(CUSTOMER_DATA_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.error('Failed to parse cached customer data:', e);
  }
  return null;
}

export async function loadCustomerData() {
  const cached = getCustomerData();
  if (cached && (cached.logo_url || cached.url) && cached.logo_icon) return cached;
  return fetchCustomerPortalData();
}

export async function loadCustomerDataPublic() {
  const cached = getCustomerData();
  if (cached && cached.logo_icon) return cached;

  try {
    const response = await fetch(`${config.baseUrl}/tasks/customer_portal_data`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) return DEFAULT_CUSTOMER_DATA;

    const data = await response.json();
    const customerData = {
      name: data.name || DEFAULT_CUSTOMER_DATA.name,
      language: data.language || DEFAULT_CUSTOMER_DATA.language,
      logo_url: data.logo_url || data.url || DEFAULT_CUSTOMER_DATA.logo_url,
      logo_icon: data.logo_icon || data.favicon || DEFAULT_CUSTOMER_DATA.logo_icon,
      logo_title: data.logo_title || data.name || DEFAULT_CUSTOMER_DATA.logo_title,
      logo_color: data.logo_color || DEFAULT_CUSTOMER_DATA.logo_color,
      url: data.logo_url || data.url || DEFAULT_CUSTOMER_DATA.url,
      url_login: data.url_login || data.logo_url || DEFAULT_CUSTOMER_DATA.url_login,
      favicon: data.logo_icon || data.favicon || DEFAULT_CUSTOMER_DATA.favicon,
      small_icon: data.small_icon || data.logo_icon || DEFAULT_CUSTOMER_DATA.small_icon
    };

    localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(customerData));
    return customerData;
  } catch {
    return DEFAULT_CUSTOMER_DATA;
  }
}

export function clearCustomerData() {
  localStorage.removeItem(CUSTOMER_DATA_KEY);
}

export function applyCustomerBranding(customerData) {
  if (!customerData) return;

  const favicon = document.querySelector('#appIcon') || document.querySelector('link[rel="icon"]');
  if (favicon && (customerData.logo_icon || customerData.favicon)) {
    favicon.href = customerData.logo_icon || customerData.favicon;
  }

  const title = customerData.logo_title || customerData.name;
  if (title) {
    // Branding is applied only to an account (admin) session.
    document.title = titleForRole(title, 'admin');
  }

  if (customerData.logo_color) {
    const isValidColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i.test(customerData.logo_color);
    if (isValidColor) {
      document.documentElement.style.setProperty('--accent-color', customerData.logo_color);
    }
  }
}

export default {
  fetchCustomerPortalData,
  getCustomerData,
  loadCustomerData,
  clearCustomerData,
  applyCustomerBranding
};
