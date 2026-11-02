import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { endOfDay, startOfDay } from 'date-fns';
import { reportsApi } from '../../services/api/reportsApi';
import { detectCustomVariables as detectVariables, BUILTIN_VARS } from '../../utils/reportVariables';

/**
 * Unified Reports Hook
 * All reports are handled through the same API.
 * Every report executes read-only SQL against the application's PostgreSQL DB.
 */
const useReports = () => {
  // Whichever session is signed in (only one ever is): an account's JWT, or a
  // user's. With the account token alone, a user's requests went out with no
  // Authorization and every one came back 401.
  const { access: accountToken } = useAuth();
  const { token: userToken } = useUserAuth();
  const access = accountToken || userToken;
  const [reports, setReports] = useState([]);
  const [selectedReportData, setSelectedReportData] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingReportData, setLoadingReportData] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorReports, setErrorReports] = useState(null);
  const [errorReportData, setErrorReportData] = useState(null);

  // Report detail (includes statement for variable detection)
  const [reportDetail, setReportDetail] = useState(null);
  // Custom variable values provided by user
  const [customVariables, setCustomVariables] = useState({});
  // Blazer smart variables: { varName: [{ value, label }] } — dropdown options
  const [smartVariables, setSmartVariables] = useState({});

  // Query configs from /api/reports/queries (fields, group, order options per query)
  const [queryConfigs, setQueryConfigs] = useState([]);

  // Dynamic field/group/order selections
  const [selectedFields, setSelectedFields] = useState([]);
  const [groupByFields, setGroupByFields] = useState([]);
  const [orderByFields, setOrderByFields] = useState([]);

  const [dateRange, setDateRange] = useState(() => [startOfDay(new Date()), endOfDay(new Date())]);
  const [savedDateRange, setSavedDateRange] = useState(null);
  // Filter/group field descriptors for the selected report (?action=segments)
  const [reportSegments, setReportSegments] = useState([]);
  // The user's SAVED segment values (?action=params) — what overrides queries.yml
  const [savedSegments, setSavedSegments] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(100);

  const commonHeaders = useMemo(() => ({
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8,he;q=0.7',
    'Authorization': access ? `Bearer ${access}` : '',
  }), [access]);

  // Built-in Mustache variables that the backend auto-fills

  // Active query config for the currently selected report
  const activeQueryConfig = useMemo(() => {
    if (!reportDetail?.query || !queryConfigs.length) return null;
    return queryConfigs.find(q => q.name === reportDetail.query) || null;
  }, [reportDetail, queryConfigs]);

  // Available options derived from the active query config
  const availableFields = useMemo(() => {
    if (!activeQueryConfig) return [];
    return (activeQueryConfig.fields || []).map(f => f.name);
  }, [activeQueryConfig]);

  const availableGroups = useMemo(() => {
    if (!activeQueryConfig) return [];
    return (activeQueryConfig.group || []).map(g => g.name);
  }, [activeQueryConfig]);

  const availableOrders = useMemo(() => {
    if (!activeQueryConfig) return [];
    return (activeQueryConfig.order || []).map(o => o.name);
  }, [activeQueryConfig]);

  // Check if the query uses {{{columns}}} placeholder (needs dynamic field resolution)
  const queryUsesColumns = useMemo(() => {
    if (!activeQueryConfig?.statement) return false;
    return activeQueryConfig.statement.includes('{{{columns}}}');
  }, [activeQueryConfig]);

  // Initialize selections when query config changes
  useEffect(() => {
    if (!activeQueryConfig) {
      setSelectedFields([]);
      setGroupByFields([]);
      setOrderByFields([]);
      return;
    }

    const fields = (activeQueryConfig.fields || []).map(f => f.name);
    const groups = (activeQueryConfig.group || []).map(g => g.name);
    const orders = (activeQueryConfig.order || []).map(o => o.name);

    // A saved segment is the user's own choice and beats the queries.yml
    // default — same precedence the API applies server-side.
    const saved = (field) => {
      const s = savedSegments.find(e => e.field === field);
      if (!s) return null;
      const vals = (Array.isArray(s.value) ? s.value : [s.value]).filter(Boolean);
      return vals.length ? vals : null;
    };

    setSelectedFields(saved('fields') || fields);
    setGroupByFields(saved('group_columns') || groups);
    // First order option selected by default
    setOrderByFields(orders.length > 0 ? [orders[0]] : []);
  }, [activeQueryConfig, savedSegments]);

  // Detects both Mustache ({{{var}}}) and Blazer ({var}) syntax — see
  // src/utils/reportVariables.js (unit-tested there).
  const detectCustomVariables = useCallback(
    (statement) => detectVariables(statement, BUILTIN_VARS),
    []
  );

  // Smart variables (Blazer): declared once in queries.yml, resolved server-side
  // into {value,label} options. Fetched once — the set is global, not per report.
  useEffect(() => {
    const fetchSmartVariables = async () => {
      try {
        const data = await reportsApi.getVariables();
        setSmartVariables(data && typeof data === 'object' ? data : {});
      } catch (error) {
        console.error('Failed to fetch smart variables:', error);
        setSmartVariables({});
      }
    };
    fetchSmartVariables();
  }, []);

  // Fetch query configs from /api/reports/queries on mount
  useEffect(() => {
    const fetchQueryConfigs = async () => {
      try {
        const response = await fetch('/api/reports/queries', {
          method: 'GET',
          headers: commonHeaders,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setQueryConfigs(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to fetch query configs:', error);
        setQueryConfigs([]);
      }
    };
    fetchQueryConfigs();
  }, [commonHeaders]);

  // Fetch report detail (includes statement for variable detection)
  const fetchReportDetail = useCallback(async (reportUuid) => {
    if (!reportUuid) {
      setReportDetail(null);
      setCustomVariables({});
      return;
    }
    try {
      // Via reportsApi, not raw fetch: commonHeaders sends an EMPTY
      // Authorization header when `access` hasn't landed in context yet, which
      // is a guaranteed 401. Opening a report to edit it (?report=<uuid> deep
      // link) hits exactly that race. apiService reads the token from
      // localStorage, so it can't be stale.
      const detail = await reportsApi.getReport(reportUuid);
      setReportDetail(detail);

      // Pre-populate custom variable keys with empty values
      const vars = detectCustomVariables(detail.statement);
      const initial = {};
      vars.forEach(v => { initial[v] = ''; });
      setCustomVariables(initial);
    } catch (error) {
      console.error(`Failed to fetch report detail ${reportUuid}:`, error);
      setReportDetail(null);
      setCustomVariables({});
    }
  }, [commonHeaders, detectCustomVariables]);

  // Fetch saved parameters for a report
  const fetchReportParams = useCallback(async (reportUuid) => {
    if (!reportUuid) {
      setSavedDateRange(null);
      return;
    }
    setSavedDateRange(null);

    try {
      const url = `/api/reports/${reportUuid}?action=params`;
      const response = await fetch(url, {
        method: 'GET',
        headers: commonHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const params = await response.json();

      const paramsArray = Array.isArray(params) ? params : [];
      const dateParam = paramsArray.find(p => p.field === 'call.created_at');
      if (dateParam && dateParam.value && Array.isArray(dateParam.value) && dateParam.value.length === 2) {
        const [startTimestamp, endTimestamp] = dateParam.value;
        const startDate = new Date(parseInt(startTimestamp) * 1000);
        const endDate = new Date(parseInt(endTimestamp) * 1000);
        setSavedDateRange([startDate, endDate]);
      } else {
        // No saved date params - fall back to default date range so data still gets fetched
        setSavedDateRange(dateRange);
      }
    } catch (error) {
      console.error(`Failed to fetch params for report ${reportUuid}:`, error);
      setSavedDateRange(dateRange);
    }
  }, [commonHeaders, dateRange]);

  // Save parameters for a report
  const saveReportParams = useCallback(async (reportUuid, range) => {
    if (!reportUuid || !range || !range[0] || !range[1]) return;

    try {
      const [startDate, endDate] = range;
      const startTimestamp = Math.floor(new Date(startDate).setHours(0, 0, 0, 0) / 1000);
      const endTimestamp = Math.floor(new Date(endDate).setHours(23, 59, 59, 999) / 1000);

      const paramsBody = new URLSearchParams();
      paramsBody.append('action', 'save_params');
      paramsBody.append('params[call.created_at][field]', 'call.created_at');
      paramsBody.append('params[call.created_at][value]', `${startTimestamp} - ${endTimestamp}`);
      paramsBody.append('params[call.created_at][operator]', 'custom');

      const saveUrl = `/api/reports/${reportUuid}?action=save_params`;
      const saveResp = await fetch(saveUrl, {
        method: 'PATCH',
        headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: paramsBody.toString(),
      });

      if (!saveResp.ok) {
        const errText = await saveResp.text();
        throw new Error(`Failed to save report params. status: ${saveResp.status}, body: ${errText}`);
      }
    } catch (error) {
      console.error(`Failed to save params for report ${reportUuid}:`, error);
    }
  }, [commonHeaders]);

  // The report's available filter/group fields — descriptors from the server,
  // same contract the Calls screen gets from /api/calls?action=segments.
  const fetchReportSegments = useCallback(async (reportUuid) => {
    if (!reportUuid) return;
    try {
      const data = await reportsApi.getReportSegments(reportUuid);
      setReportSegments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(`Failed to fetch segments for report ${reportUuid}:`, error);
      setReportSegments([]);
    }
  }, []);

  // The user's saved segment values for a report — the same ?action=params
  // contract the Calls screen uses for its saved filters.
  const fetchSavedSegments = useCallback(async (reportUuid) => {
    if (!reportUuid) return [];
    try {
      const data = await reportsApi.getReportParams(reportUuid);
      const list = Array.isArray(data) ? data : [];
      setSavedSegments(list);
      return list;
    } catch (error) {
      console.error(`Failed to fetch saved segments for report ${reportUuid}:`, error);
      setSavedSegments([]);
      return [];
    }
  }, []);

  // Save one segment (grouping, or any filter field) for a report.
  const saveReportSegment = useCallback(async (reportUuid, field, value, operator = 'IS') => {
    if (!reportUuid || !field) return;
    const body = new URLSearchParams();
    body.append('params[field]', field);
    (Array.isArray(value) ? value : [value]).forEach((v) => body.append('params[value][]', v));
    body.append('params[operator]', operator);
    try {
      const resp = await fetch(`/api/reports/${reportUuid}?action=save_params`, {
        method: 'PATCH',
        headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      await fetchSavedSegments(reportUuid);
    } catch (error) {
      console.error(`Failed to save segment ${field} for report ${reportUuid}:`, error);
    }
  }, [commonHeaders, fetchSavedSegments]);

  // Fetch the list of all reports from API
  useEffect(() => {
    const fetchReportsList = async () => {
      setLoadingReports(true);
      setErrorReports(null);
      try {
        const url = `/api/reports`;

        const response = await fetch(url, {
          method: 'GET',
          headers: commonHeaders,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Use reports as-is from the API.
        setReports(data || []);
      } catch (error) {
        console.error("Failed to fetch reports list:", error);
        setErrorReports(error.message);
        setReports([]);
      } finally {
        setLoadingReports(false);
      }
    };

    fetchReportsList();
  }, [commonHeaders]);

  // Build query selection params for URL
  const buildSelectionParams = useCallback(() => {
    if (!queryUsesColumns) return '';

    let params = '';

    // Append selected columns
    if (selectedFields.length > 0) {
      selectedFields.forEach(f => {
        params += `&columns[]=${encodeURIComponent(f)}`;
      });
    }

    // Append group_by
    if (groupByFields.length > 0) {
      groupByFields.forEach(f => {
        params += `&group_by[]=${encodeURIComponent(f)}`;
      });
    }

    // Append order_by
    if (orderByFields.length > 0) {
      orderByFields.forEach(f => {
        params += `&order_by[]=${encodeURIComponent(f)}`;
      });
    }

    return params;
  }, [queryUsesColumns, selectedFields, groupByFields, orderByFields]);

  // Fetch data for a specific PostgreSQL report.
  const fetchReportData = useCallback(async (reportUuid, range = dateRange, resetData = true) => {
    if (!reportUuid) {
      return;
    }

    if (resetData) {
      setLoadingReportData(true);
      setErrorReportData(null);
      setAllRows([]);
      setCurrentPage(0);
      setHasNextPage(true);
    }

    // Build URL with action=run; the backend executes it on PostgreSQL.
    let url = `/api/reports/${reportUuid}?action=run`;

    const [startDate, endDate] = range;

    if (startDate && endDate) {
      const startTimestamp = Math.floor(new Date(startDate).setHours(0, 0, 0, 0) / 1000);
      const endTimestamp = Math.floor(new Date(endDate).setHours(23, 59, 59, 999) / 1000);
      url += `&start_date=${startTimestamp}&end_date=${endTimestamp}`;
    }

    // Add pagination parameters
    url += `&limit=${pageSize}&offset=${resetData ? 0 : currentPage * pageSize}`;

    // Append field/group/order selections for queries that use {{{columns}}}
    url += buildSelectionParams();

    // Append custom Mustache variable values as query params
    Object.entries(customVariables).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null) {
        url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
      }
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: commonHeaders,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('REPORTS DEBUG: Error response body:', errorBody);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }
      const data = await response.json();

      // Handle backend error response (200 with error field)
      if (data.error) {
        setErrorReportData(data.error);
        setSelectedReportData(prev => ({
          ...(prev || {}),
          report_uuid: reportUuid,
          name: prev?.name || reportUuid,
        }));
        setAllRows([]);
        setHasNextPage(false);
        return;
      }

      if (resetData) {
        setSelectedReportData({
          ...data,
          report_uuid: reportUuid
        });

        // Extract data array from various response formats
        let dataArray = [];
        if (data.table && data.table.data && Array.isArray(data.table.data)) {
          dataArray = data.table.data;
        } else if (data.data && Array.isArray(data.data)) {
          dataArray = data.data;
        } else if (Array.isArray(data)) {
          dataArray = data;
        }

        setAllRows(dataArray);
        setHasNextPage(dataArray.length === pageSize);
      } else {
        // Append new data for infinite scroll
        let dataArray = [];
        if (data.table && data.table.data && Array.isArray(data.table.data)) {
          dataArray = data.table.data;
        } else if (data.data && Array.isArray(data.data)) {
          dataArray = data.data;
        } else if (Array.isArray(data)) {
          dataArray = data;
        }

        if (dataArray.length > 0) {
          setAllRows(prev => [...prev, ...dataArray]);
          setHasNextPage(dataArray.length === pageSize);
        } else {
          setHasNextPage(false);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch data for report ${reportUuid}:`, error);
      setErrorReportData(error.message);
    } finally {
      if (resetData) {
        setLoadingReportData(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [dateRange, commonHeaders, pageSize, currentPage, customVariables, buildSelectionParams]);

  // Load more data for infinite scroll
  const loadMoreData = useCallback(async (reportUuid) => {
    if (!reportUuid || !hasNextPage || loadingMore) return;

    setLoadingMore(true);
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);

    let url = `/api/reports/${reportUuid}?action=run`;

    const [startDate, endDate] = dateRange;
    if (startDate && endDate) {
      const startTimestamp = Math.floor(new Date(startDate).setHours(0, 0, 0, 0) / 1000);
      const endTimestamp = Math.floor(new Date(endDate).setHours(23, 59, 59, 999) / 1000);
      url += `&start_date=${startTimestamp}&end_date=${endTimestamp}`;
    }

    url += `&limit=${pageSize}&offset=${nextPage * pageSize}`;

    // Include field/group/order selections for consistency
    url += buildSelectionParams();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: commonHeaders,
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const data = await response.json();

      let dataArray = [];
      if (data.table && data.table.data && Array.isArray(data.table.data)) {
        dataArray = data.table.data;
      } else if (data.data && Array.isArray(data.data)) {
        dataArray = data.data;
      } else if (Array.isArray(data)) {
        dataArray = data;
      }

      if (dataArray.length > 0) {
        setAllRows(prev => [...prev, ...dataArray]);
        setHasNextPage(dataArray.length === pageSize);
      } else {
        setHasNextPage(false);
      }
    } catch (error) {
      console.error(`Failed to load more data for report ${reportUuid}:`, error);
      setErrorReportData(error.message);
    } finally {
      setLoadingMore(false);
    }
  }, [commonHeaders, pageSize, currentPage, hasNextPage, loadingMore, dateRange, buildSelectionParams]);

  // Refresh the reports list
  const refreshReports = useCallback(async () => {
    setLoadingReports(true);
    setErrorReports(null);
    try {
      const data = await reportsApi.getReports();
      const reportsArray = Array.isArray(data) ? data : (data?.data || []);
      setReports(reportsArray);
    } catch (error) {
      console.error('Failed to refresh reports list:', error);
      setErrorReports(error.message);
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  // Create a new PostgreSQL report.
  const createReport = useCallback(async (reportData) => {
    try {
      // Backend validates that both fields[] and params[] are non-empty arrays.
      // The dialog is responsible for providing them; we pass through without
      // defaulting to [] (which would fail validation).
      const apiData = {
        name: reportData.name,
        type: reportData.type || 'table',
        enabled: reportData.enabled !== false,
        notes: reportData.notes || '',
        fields: reportData.fields,
        params: reportData.params,
      };

      if (reportData.query) {
        apiData.query = reportData.query;
      }

      if (reportData.meta) {
        apiData.meta = reportData.meta;
      }

      // Include statement if provided
      if (reportData.sql || reportData.statement) {
        apiData.statement = reportData.sql || reportData.statement;
      }

      const result = await reportsApi.createReport(apiData);
      // Refresh the reports list after creation
      await refreshReports();
      return result;
    } catch (error) {
      console.error('Failed to create report:', error);
      throw error;
    }
  }, [refreshReports]);

  // Fork a report — Blazer-style. The API accepts either a saved UUID or a
  // queries.yml template name and creates the editable saved copy atomically.
  const forkReport = useCallback(async (reportId, options = {}) => {
    const result = await reportsApi.forkReport(reportId, options);
    await refreshReports();
    return result;
  }, [refreshReports]);

  // Update an existing report
  const updateReport = useCallback(async (reportUuid, reportData) => {
    try {
      const result = await reportsApi.updateReport(reportUuid, reportData);
      await refreshReports();
      // Re-fetch detail so UI picks up changes
      fetchReportDetail(reportUuid);
      return result;
    } catch (error) {
      console.error('Failed to update report:', error);
      throw error;
    }
  }, [refreshReports, fetchReportDetail]);

  // Delete a report
  const deleteReport = useCallback(async (reportUuid) => {
    try {
      await reportsApi.deleteReport(reportUuid);
      await refreshReports();
    } catch (error) {
      console.error('Failed to delete report:', error);
      throw error;
    }
  }, [refreshReports]);


  return {
    reports,
    dateRange,
    setDateRange,
    savedDateRange,
    setSavedDateRange,
    selectedReportData,
    setSelectedReportData,
    allRows,
    hasNextPage,
    loadingReports,
    loadingReportData,
    loadingMore,
    errorReports,
    errorReportData,
    fetchReportData,
    fetchReportParams,
    saveReportParams,
    reportSegments,
    fetchReportSegments,
    savedSegments,
    fetchSavedSegments,
    saveReportSegment,
    loadMoreData,
    createReport,
    forkReport,
    updateReport,
    deleteReport,
    refreshReports,
    // Custom Mustache variable support
    reportDetail,
    customVariables,
    setCustomVariables,
    smartVariables,
    fetchReportDetail,
    // Dynamic field/group/order query builder
    queryConfigs,
    activeQueryConfig,
    queryUsesColumns,
    availableFields,
    availableGroups,
    availableOrders,
    selectedFields,
    setSelectedFields,
    groupByFields,
    setGroupByFields,
    orderByFields,
    setOrderByFields,
  };
};

export default useReports;
