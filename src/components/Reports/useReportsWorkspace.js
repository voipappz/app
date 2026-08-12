import { useCallback, useEffect, useRef, useState } from 'react';
import { getReportParams, listReports, runReport, savedDateRange } from '../../services/reportsApi';
import { normalizeReportResult } from './reportData';

/** The deliberately small state layer for the list -> select -> run workflow. */
export default function useReportsWorkspace() {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [result, setResult] = useState(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingResult, setLoadingResult] = useState(false);
  const [reportsError, setReportsError] = useState(null);
  const [resultError, setResultError] = useState(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    listReports()
      .then((items) => {
        if (!active) return;
        setReports(items);
        setReportsError(null);
      })
      .catch((error) => {
        if (!active) return;
        setReports([]);
        setReportsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => { if (active) setLoadingReports(false); });
    return () => { active = false; };
  }, []);

  const loadReport = useCallback(async (report, filters, preferSavedRange = false) => {
    if (!report?.uuid) return null;
    const request = ++requestSequence.current;
    setSelectedReport(report);
    setLoadingResult(true);
    setResultError(null);
    setResult(null);

    let effectiveFilters = { ...filters };
    if (preferSavedRange) {
      try {
        const saved = savedDateRange(await getReportParams(report.uuid));
        if (saved) effectiveFilters = { ...effectiveFilters, ...saved };
      } catch {
        // Saved preferences must never prevent a report from running.
      }
    }

    try {
      const payload = await runReport(report.uuid, effectiveFilters);
      if (request !== requestSequence.current) return null;
      setResult(normalizeReportResult(payload, report));
      return effectiveFilters;
    } catch (error) {
      if (request === requestSequence.current) {
        setResultError(error instanceof Error ? error.message : String(error));
      }
      return null;
    } finally {
      if (request === requestSequence.current) setLoadingResult(false);
    }
  }, []);

  const selectReport = useCallback(
    (report, filters) => loadReport(report, filters, true),
    [loadReport],
  );

  const refreshReport = useCallback(
    (filters) => loadReport(selectedReport, filters, false),
    [loadReport, selectedReport],
  );

  return {
    reports,
    selectedReport,
    result,
    loadingReports,
    loadingResult,
    reportsError,
    resultError,
    selectReport,
    refreshReport,
  };
}
