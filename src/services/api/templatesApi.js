import { apiService, toFormData } from '../apiService';

export const templatesApi = {
  getTemplates: async (params = {}) => {
    // Build query string manually to keep bracket notation unencoded for legacy API
    // Keys like search[name] must NOT have brackets encoded (URLSearchParams encodes them)
    const queryParts = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        queryParts.push(`${key}=${encodeURIComponent(value)}`);
      }
    }
    const queryString = queryParts.join('&');
    const url = `/api/templates${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching templates', false);
  },

  // The customer's template for a VML type — where a new VML of that type
  // starts (GET /api/templates/vml/:type; created from the default the first
  // time, then edited like any template).
  getVmlTemplate: async (vmlType, environmentUuid) => {
    const qs = new URLSearchParams({ environment_uuid: environmentUuid || '' });
    return apiService.get(`/api/templates/vml/${encodeURIComponent(vmlType)}?${qs}`, {}, `fetching ${vmlType} VML template`, false);
  },

  getTemplate: async (templateId) => {
    const url = `/api/templates/${templateId}`;
    return apiService.get(url, {}, `fetching template ${templateId}`, false);
  },

  createTemplate: async (templateData) => {
    const url = `/api/templates`;
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const formData = toFormData(templateData);
    return apiService.post(url, formData, headers, 'creating template', true);
  },

  updateTemplate: async (templateId, templateData) => {
    const url = `/api/templates/${templateId}`;
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const formData = toFormData(templateData);
    return apiService.patch(url, formData, headers, `updating template ${templateId}`, true);
  },

  deleteTemplate: async (templateId) => {
    const url = `/api/templates/${templateId}`;
    return apiService.delete(url, {}, `deleting template ${templateId}`, true);
  },
};

export default templatesApi;
