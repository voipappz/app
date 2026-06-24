import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { DirectionProvider } from './context/DirectionContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import SipPhoneProvider from './context/SipPhoneContext';
import { FireberryProvider } from './context/FireberryContext';
import { useACL } from './hooks/useACL';
import { ROUTE_PERMISSIONS } from './config/permissions';
import Layout from './components/Layout/Layout.jsx';

import Login from './components/Login/Login.jsx';
import Dashboard from './components/Dashboard/dashboard.tsx';
import Reports from './components/Reports/UsageReports.jsx';
import Calls from './components/Calls/Calls.jsx';
import Notifications from './components/Notifications/Notifications.jsx';
import SystemStatus from './components/Status/SystemStatus.jsx';

function getPermissionForPath(pathname) {
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];
  for (const [pattern, permission] of Object.entries(ROUTE_PERMISSIONS)) {
    const regex = new RegExp('^' + pattern.replace(/:[\w]+/g, '[^/]+') + '$');
    if (regex.test(pathname)) return permission;
  }
  return null;
}

const ProtectedRoute = ({ children, permission }) => {
  const { isAuthenticated } = useAuth();
  const { can } = useACL();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const requiredPermission = permission || getPermissionForPath(location.pathname);
  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

function AppContent() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<PublicRoute><Layout><Login /></Layout></PublicRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/calls" element={<ProtectedRoute><Layout><Calls /></Layout></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
        <Route path="/status" element={<ProtectedRoute><Layout><SystemStatus /></Layout></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <DirectionProvider>
      <AuthProvider>
        <SipPhoneProvider>
          <FireberryProvider>
            <AppContent />
          </FireberryProvider>
        </SipPhoneProvider>
      </AuthProvider>
    </DirectionProvider>
  );
}

export default App;
