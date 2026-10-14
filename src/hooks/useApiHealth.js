import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Module-level singleton state so multiple consumers (TopBar dialog, Sidebar
// status pill) share one poll loop instead of each running their own timer.
const state = {
  isHealthy: null,
  status: 0,
  response: null,
  checks: null, // { database: {ok, ms}, redis: {ok, ms}, nats: {ok, ms, error} }
  loading: true,
};
const subscribers = new Set();
let intervalId = null;
let started = false;

const notify = () => subscribers.forEach((fn) => fn({ ...state }));

const setState = (patch) => {
  Object.assign(state, patch);
  notify();
};

// Always verbose: the topbar shows the per-dependency app health (database /
// redis / nats) from the same poll, so every check carries the checks payload.
//
// /api/health, NOT /health: at the mothership's Kong /health is GATUS (its
// endpoint statuses array) and the API's own health moved to /api/health
// (mothership f12d37a, 2026-09-15). Polling /health showed Gatus's list where
// the API's database / redis / nats checks belong.
export const checkHealth = async ({ verbose = true } = {}) => {
  const url = verbose ? '/api/health?verbose' : '/api/health';
  if (verbose) setState({ loading: state.response === null });
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    let data = null;
    if (verbose) {
      try {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
      } catch { data = { error: 'Unable to read response' }; }
    }
    setState({
      isHealthy: response.status === 200,
      status: response.status,
      ...(verbose ? { response: data, checks: data?.checks || null } : {}),
      loading: false,
    });
  } catch (error) {
    setState({
      isHealthy: false,
      status: 0,
      ...(verbose ? { response: { error: error.message || 'Health check failed' }, checks: null } : {}),
      loading: false,
    });
  }
};

export const useApiHealth = () => {
  const { isAuthenticated } = useAuth();
  const [snapshot, setSnapshot] = useState({ ...state });

  useEffect(() => {
    subscribers.add(setSnapshot);
    return () => subscribers.delete(setSnapshot);
  }, []);

  useEffect(() => {
    if (started) return undefined;
    started = true;
    checkHealth();
    const restart = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(checkHealth, isAuthenticated ? 30000 : 60000);
    };
    restart();
    return () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      started = false;
    };
  }, [isAuthenticated]);

  const refresh = useCallback(() => checkHealth({ verbose: true }), []);

  return {
    isHealthy: snapshot.isHealthy,
    loading: snapshot.loading,
    status: snapshot.status,
    response: snapshot.response,
    checks: snapshot.checks,
    refresh,
  };
};

export default useApiHealth;
