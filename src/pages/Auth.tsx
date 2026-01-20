import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Truck, Mail, ArrowRight, Sparkles, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import truckingHero from '@/assets/trucking-hero.jpg';

type AuthMode = 'password' | 'magic' | 'forgot';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const prefillEmail = searchParams.get('email') || '';
  
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('password');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  // Redirect based on role after login
  useEffect(() => {
    // Only redirect once loading is complete AND we have a definitive answer
    if (user && !roleLoading) {
      console.log('[Auth] Redirect check - role:', role, 'user:', user.id);
      if (role === 'agency_admin' || role === 'super_admin') {
        console.log('[Auth] Redirecting to /admin/dashboard');
        navigate('/admin/dashboard', { replace: true });
      } else if (role === 'agent') {
        console.log('[Auth] Redirecting to /dashboard');
        navigate('/dashboard', { replace: true });
      } else if (role === null) {
        // User exists but no role found - access denied
        console.log('[Auth] No role found, redirecting to /access-denied');
        navigate('/access-denied', { replace: true });
      }
    }
  }, [user, role, roleLoading, navigate]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter email and password');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });
      
      if (error) {
        toast.error(error.message);
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      
      if (error) {
        toast.error(error.message);
      } else {
        setSent(true);
        toast.success('Magic link sent! Check your email');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        toast.error(error.message);
      } else {
        setResetSent(true);
        toast.success('Password reset email sent!');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking role
  if (user && roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left side - Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img 
          src={'https://truckinglane.s3.us-east-1.amazonaws.com/trucking-hero.jpg'} 
          alt="Semi truck on highway at sunset" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,15%,10%)]/90 via-[hsl(220,15%,10%)]/70 to-transparent" />
        <div className="absolute top-0 left-0 w-2 h-full bg-[hsl(25,95%,53%)]" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="pl-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-[hsl(25,95%,53%)] flex items-center justify-center shadow-lg">
                <Truck className="h-7 w-7 text-white" />
              </div>
              <span className="text-2xl font-bold text-white tracking-tight drop-shadow-lg">
                Trucking Lane
              </span>
            </div>
          </div>

          <div className="space-y-6 pl-4">
            <div className="flex items-center gap-2 text-[hsl(25,95%,53%)]">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">AI-Powered Dispatch</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight drop-shadow-lg">
              Let AI answer<br />your load calls
            </h1>
            <p className="text-lg text-white/90 max-w-md drop-shadow">
              Automate your dispatch workflow. Never miss a load opportunity again.
            </p>
          </div>

          <div className="text-sm text-white/70 pl-4">
            © 2025 TruckingLane.com — a Seeksy Product.
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-[hsl(25,95%,53%)] flex items-center justify-center">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold">Trucking Lane</span>
          </div>

          {!sent && !resetSent ? (
            <>
              <div className="text-center lg:text-left">
                <h2 className="text-2xl lg:text-3xl font-bold text-foreground">
                  {authMode === 'forgot' ? 'Reset your password' : 'Sign in to your account'}
                </h2>
                <p className="text-muted-foreground mt-2">
                  {authMode === 'password' 
                    ? 'Enter your credentials to continue' 
                    : authMode === 'magic'
                    ? 'Enter your email to receive a magic link'
                    : 'Enter your email to receive a reset link'}
                </p>
              </div>

              {/* Auth mode toggle - hide when in forgot mode */}
              {authMode !== 'forgot' && (
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAuthMode('password')}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                      authMode === 'password'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('magic')}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                      authMode === 'magic'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Magic Link
                  </button>
                </div>
              )}

              <form 
                onSubmit={
                  authMode === 'password' 
                    ? handlePasswordLogin 
                    : authMode === 'magic' 
                    ? handleMagicLink 
                    : handleForgotPassword
                } 
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="h-12 pl-10"
                      required
                      autoFocus={!prefillEmail}
                    />
                  </div>
                </div>

                {authMode === 'password' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={() => setAuthMode('forgot')}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="h-12 pl-10 pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 text-base gap-2" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {authMode === 'password' ? 'Signing in...' : 'Sending...'}
                    </>
                  ) : (
                    <>
                      {authMode === 'password' ? 'Sign In' : authMode === 'magic' ? 'Send Magic Link' : 'Send Reset Link'}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {authMode === 'forgot' ? (
                <p className="text-center text-sm">
                  <button
                    type="button"
                    onClick={() => setAuthMode('password')}
                    className="text-primary hover:underline"
                  >
                    Back to sign in
                  </button>
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  {authMode === 'password' 
                    ? 'Or use Magic Link for passwordless sign in.'
                    : 'No password needed. We\'ll email you a secure login link.'}
                </p>
              )}
            </>
          ) : resetSent ? (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
                <p className="text-muted-foreground mt-2">
                  We sent a password reset link to <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Click the link in the email to reset your password.
              </p>
              <Button 
                variant="outline" 
                onClick={() => {
                  setResetSent(false);
                  setAuthMode('password');
                }}
                className="mt-4"
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
                <p className="text-muted-foreground mt-2">
                  We sent a magic link to <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Click the link in the email to sign in. The link expires in 1 hour.
              </p>
              <Button 
                variant="outline" 
                onClick={() => setSent(false)}
                className="mt-4"
              >
                Use a different email
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
