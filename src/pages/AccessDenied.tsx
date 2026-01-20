import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { ShieldX, LogOut, Mail, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AccessDenied() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // If user has a role, redirect them to dashboard
  useEffect(() => {
    if (!authLoading && !roleLoading && role) {
      console.log('[AccessDenied] User has role, redirecting to dashboard');
      if (role === 'agency_admin' || role === 'super_admin') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [role, roleLoading, authLoading, navigate]);

  // If not logged in, redirect to auth
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      // Force navigation after signout
      window.location.href = '/auth';
    } catch (error) {
      console.error('Sign out error:', error);
      setSigningOut(false);
    }
  };

  // Show loading while checking role
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't show access denied if user has a role (will redirect)
  if (role) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldX className="h-10 w-10 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">
            Your account hasn't been granted access to this application yet.
          </p>
        </div>

        {user?.email && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg py-3 px-4">
            <Mail className="h-4 w-4" />
            <span>Signed in as <span className="font-medium text-foreground">{user.email}</span></span>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Please contact your agency administrator to request access.
          </p>
          
          <Button 
            onClick={handleSignOut} 
            variant="outline" 
            className="gap-2"
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </Button>
        </div>
      </div>
    </div>
  );
}
