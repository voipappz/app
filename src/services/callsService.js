import { config } from '../config.js';

const API_BASE_URL = config.apiBaseUrl;

/**
 * Fetch available filter segments from the API
 * These are dynamic filter options that can be used to filter calls
 * @param {string} token - Authorization token
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export const getSegments = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/calls?action=segments`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    throw new Error(`Failed to fetch segments: ${error.message}`, { cause: error });
  }
};

/**
 * Fetch available filter fields from the API
 * @param {string} token - Authorization token
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export const getFields = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/calls?action=fields`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    throw new Error(`Failed to fetch fields: ${error.message}`, { cause: error });
  }
};

/**
 * Fetch column configuration from the API
 * @param {string} token - Authorization token
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export const getColumns = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/calls?action=columns`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    throw new Error(`Failed to fetch columns: ${error.message}`, { cause: error });
  }
};

export const saveFilterParameters = async (searchParams, token) => {
  try {
    // Format the parameters according to the API specification
    const formData = new FormData();
    
    Object.entries(searchParams).forEach(([key, value]) => {
      // Handle text search parameter
      if (key === 'search[text]') {
        formData.append(`params[text][field]`, 'text');
        formData.append(`params[text][value]`, value);
        formData.append(`params[text][operator]`, 'IS');
        return;
      }

      // Parse the parameter key to extract field, operator, and value
      const match = key.match(/search\[call\.(.+?)\]\[(.+?)\](\[\])?/);
      if (match) {
        const field = match[1];
        const operator = match[2];
        
        // Format the parameter for the API
        formData.append(`params[call.${field}][field]`, `call.${field}`);
        formData.append(`params[call.${field}][value]`, Array.isArray(value) ? value[0] : value);
        formData.append(`params[call.${field}][operator]`, operator);
      }
    });

    const response = await fetch(`${API_BASE_URL}/calls?action=save_params`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // API returns no response according to README
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to save parameters: ${error.message}`, { cause: error });
  }
};

export const loadFilterParameters = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/calls?action=params`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    throw new Error(`Failed to load parameters: ${error.message}`, { cause: error });
  }
};

// Convert API response format to UI search params format
export const convertApiParamsToSearchParams = (apiParams) => {
  const searchParams = {};
  
  if (!Array.isArray(apiParams)) {
    return searchParams;
  }

  apiParams.forEach(param => {
    const { field, operator, value } = param;
    
    if (!field || !operator || value === undefined) {
      return;
    }

    // Handle text search parameter
    if (field === 'text') {
      searchParams['search[text]'] = value;
      return;
    }

    // Convert the API format to UI format
    // API: { field: "call.caller", operator: "IS", value: "John" }
    // UI: { "search[call.caller][IS][]": "John" }
    
    let searchKey;
    const fieldName = field; // Already includes "call." prefix
    
    // Handle different operators and field types
    if (operator === 'GTE' || operator === 'LTE') {
      searchKey = `search[${fieldName}][${operator}][]`;
    } else if (operator === 'IS') {
      // Handle special cases for different field types
      if (fieldName === 'call.direction') {
        searchKey = `search[${fieldName}][IS]`;
        searchParams[searchKey] = [value]; // Direction expects array
      } else if (fieldName === 'call.environment_uuid') {
        searchKey = `search[${fieldName}][]`;
        searchParams[searchKey] = Array.isArray(value) ? value : [value];
      } else {
        searchKey = `search[${fieldName}][IS][]`;
        searchParams[searchKey] = value;
      }
      return; // Skip the general assignment below
    } else {
      // Default format
      searchKey = `search[${fieldName}][${operator}][]`;
    }
    
    searchParams[searchKey] = value;
  });

  return searchParams;
};