import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import AccessDenied from "./pages/AccessDenied";
import ResetPassword from "./pages/ResetPassword";
import LeadDetail from "./pages/LeadDetail";
import LoadDetail from "./pages/LoadDetail";
import Analytics from "./pages/Analytics";
import Demo from "./pages/Demo";
import Extension from "./pages/Extension";
import Trust from "./pages/Trust";
import Status from "./pages/Status";
import Legal from "./pages/Legal";
import LeadDiscovery from "./pages/LeadDiscovery";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import ProspectingQueue from "./pages/ProspectingQueue";
import NotificationSettings from "./pages/NotificationSettings";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import AgencySignup from "./pages/AgencySignup";
import AcceptInvite from "./pages/AcceptInvite";
import CompleteAgencySetup from "./pages/CompleteAgencySetup";
import MyKeywords from "./pages/MyKeywords";
import CsvConverter from "./pages/CsvConverter";
import BusinessDevelopment from "./pages/BusinessDevelopment";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Protected route wrapper - checks auth AND agency membership
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  const isLoading = authLoading || roleLoading;

  console.log('[ProtectedRoute] State:', { 
    user: user?.id, 
    role, 
    authLoading, 
    roleLoading, 
    isLoading 
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    console.log('[ProtectedRoute] No user, redirecting to /auth');
    return <Navigate to="/auth" replace />;
  }

  // User is logged in but has no agency membership
  if (!role) {
    console.log('[ProtectedRoute] No role found, redirecting to /access-denied');
    return <Navigate to="/access-denied" replace />;
  }

  console.log('[ProtectedRoute] Access granted with role:', role);
  return <>{children}</>;
}

// Admin-only route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  const isLoading = authLoading || roleLoading;
  const isAdmin = role === 'agency_admin' || role === 'super_admin';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    console.log('[AdminRoute] User is not admin, redirecting to /dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// Super admin only route
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  const isLoading = authLoading || roleLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ImpersonationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/extension" element={<Extension />} />
              <Route path="/trust" element={<Trust />} />
              <Route path="/csv-converter" element={<CsvConverter />} />
              <Route path="/status" element={<Status />} />
              <Route path="/legal/:slug" element={<Legal />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/signup/agency" element={<AgencySignup />} />
              <Route path="/invite/accept/:token" element={<AcceptInvite />} />
              <Route path="/complete-agency-setup/:token" element={<CompleteAgencySetup />} />
              <Route path="/complete-agency-setup" element={<CompleteAgencySetup />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/access-denied" element={<AccessDenied />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Protected routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/platform" element={
                <SuperAdminRoute>
                  <SuperAdminDashboard />
                </SuperAdminRoute>
              } />
              <Route path="/admin/dashboard" element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              <Route path="/leads/:id" element={
                <ProtectedRoute>
                  <LeadDetail />
                </ProtectedRoute>
              } />
              <Route path="/loads/:id" element={
                <ProtectedRoute>
                  <LoadDetail />
                </ProtectedRoute>
              } />
              <Route path="/analytics" element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              } />
              <Route path="/settings/notifications" element={
                <ProtectedRoute>
                  <NotificationSettings />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />
              <Route path="/my-keywords" element={
                <ProtectedRoute>
                  <MyKeywords />
                </ProtectedRoute>
              } />
              <Route path="/business-development" element={
                <ProtectedRoute>
                  <BusinessDevelopment />
                </ProtectedRoute>
              } />
              <Route path="/lead-discovery" element={
                <AdminRoute>
                  <LeadDiscovery />
                </AdminRoute>
              } />
              <Route path="/accounts" element={
                <AdminRoute>
                  <Accounts />
                </AdminRoute>
              } />
              <Route path="/accounts/:id" element={
                <AdminRoute>
                  <AccountDetail />
                </AdminRoute>
              } />
              <Route path="/prospecting" element={
                <AdminRoute>
                  <ProspectingQueue />
                </AdminRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ImpersonationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
