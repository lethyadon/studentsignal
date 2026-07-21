import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GodModeProvider } from './context/GodModeContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import UploadCsv from './pages/UploadCsv';
import AnalysisResults from './pages/AnalysisResults';
import SignalQueue from './pages/SignalQueue';
import StudentProfile from './pages/StudentProfile';
import Interventions from './pages/Interventions';
import SuccessStories from './pages/SuccessStories';
import Careers from './pages/Careers';
import ReportsPage from './pages/ReportsPage';
import Settings from './pages/Settings';
import Communications from './pages/Communications';
import StaffDevelopment from './pages/StaffDevelopment';
import SchoolIntelligence from './pages/SchoolIntelligence';
import PlatformAdmin from './pages/PlatformAdmin';
import UserManagement from './pages/UserManagement';
import BillingSuccess from './pages/BillingSuccess';
import { CheckoutSuccess } from './pages/CheckoutSuccess';
import { PricingPage } from './components/pricing/PricingPage';
import Layout from './components/Layout';
import { GodModeBar } from './components/GodModeBar';
import './index.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl font-bold">!</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-1">{this.state.error.message}</p>
            <p className="text-xs text-slate-400 mb-6 font-mono break-all">{this.state.error.stack?.split('\n')[1]?.trim()}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard'; }}
              className="btn-primary text-sm px-5 py-2"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, demoMode, isSuperAdmin } = useAuth();
  const { isSubscribed, subscriptionLoading } = useSubscription();

  if ((loading || subscriptionLoading) && !demoMode) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">Loading...</div>;
  }

  if (!user && !demoMode) return <Navigate to="/auth" replace />;

  // Super admins bypass subscription requirement
  if (user && !demoMode && !isSubscribed && !isSuperAdmin) {
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isSuperAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">Loading...</div>;
  if (!user || !isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="/billing/success" element={<BillingSuccess />} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><Layout><UploadCsv /></Layout></ProtectedRoute>} />
      <Route path="/analysis" element={<ProtectedRoute><Layout><AnalysisResults /></Layout></ProtectedRoute>} />
      <Route path="/signal-queue" element={<ProtectedRoute><Layout><SignalQueue /></Layout></ProtectedRoute>} />
      <Route path="/students/:id" element={<ProtectedRoute><Layout><StudentProfile /></Layout></ProtectedRoute>} />
      <Route path="/interventions" element={<ProtectedRoute><Layout><Interventions /></Layout></ProtectedRoute>} />
      <Route path="/reviews" element={<Navigate to="/interventions" replace />} />
      <Route path="/success-stories" element={<ProtectedRoute><Layout><SuccessStories /></Layout></ProtectedRoute>} />
      <Route path="/careers" element={<ProtectedRoute><Layout><Careers /></Layout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Layout><ReportsPage /></Layout></ProtectedRoute>} />
      <Route path="/communications" element={<ProtectedRoute><Layout><Communications /></Layout></ProtectedRoute>} />
      <Route path="/staff-development" element={<ProtectedRoute><Layout><StaffDevelopment /></Layout></ProtectedRoute>} />
      <Route path="/intelligence" element={<ProtectedRoute><Layout><SchoolIntelligence /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
      <Route path="/user-management" element={<ProtectedRoute><Layout><UserManagement /></Layout></ProtectedRoute>} />
      <Route path="/platform-admin" element={<SuperAdminRoute><Layout><PlatformAdmin /></Layout></SuperAdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <GodModeProvider>
          <SubscriptionProvider>
            <AppErrorBoundary>
              <GodModeBar />
              <AppRoutes />
            </AppErrorBoundary>
          </SubscriptionProvider>
        </GodModeProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

