import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogoIcon } from '@/components/Logo';
import { toast } from 'sonner';
import { Loader2, Building2, Users, Check, Plus, X, ArrowRight, Mail } from 'lucide-react';

interface InviteEntry {
  id: string;
  email: string;
  role: 'agent' | 'agency_admin';
}

type Step = 'setup' | 'invite' | 'complete';

export default function CompleteAgencySetup() {
  const { token: pathToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const queryToken = searchParams.get('token');
  const token = pathToken || queryToken;
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>('setup');
  const [error, setError] = useState<string | null>(null);
  
  // Request data
  const [requestData, setRequestData] = useState<{
    id: string;
    agency_name: string;
    owner_name: string;
    owner_email: string;
    owner_phone: string | null;
  } | null>(null);
  
  // Setup form
  const [password, setPassword] = useState('');
  const [agencyId, setAgencyId] = useState<string | null>(null);
  
  // Invites
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState<'agent' | 'agency_admin'>('agent');
  const [sendingInvites, setSendingInvites] = useState(false);

  useEffect(() => {
    const fetchRequest = async () => {
      if (!token) {
        setError('Invalid setup link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/get-agency-request?token=${token}`
        );

        const result = await response.json();

        if (!response.ok) {
          setError(result.error || 'Invalid or expired link');
          setLoading(false);
          return;
        }

        setRequestData(result.request);
      } catch (err) {
        console.error('Fetch request error:', err);
        setError('Failed to load setup data');
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [token]);

  const handleCompleteSetup = async () => {
    if (!requestData || !token) return;

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/complete-agency-setup',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to complete setup');
      }

      setAgencyId(result.agencyId);
      toast.success('Account created successfully!');
      setStep('invite');
    } catch (err) {
      console.error('Setup error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to complete setup');
    } finally {
      setSubmitting(false);
    }
  };

  const addInvite = () => {
    const emailLower = newInviteEmail.toLowerCase().trim();
    if (!emailLower) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLower)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (invites.some((i) => i.email === emailLower)) {
      toast.error('This email is already in the invite list');
      return;
    }

    setInvites([
      ...invites,
      { id: crypto.randomUUID(), email: emailLower, role: newInviteRole },
    ]);
    setNewInviteEmail('');
    setNewInviteRole('agent');
  };

  const removeInvite = (id: string) => {
    setInvites(invites.filter((i) => i.id !== id));
  };

  const handleSendInvites = async () => {
    if (invites.length === 0) {
      setStep('complete');
      return;
    }

    setSendingInvites(true);
    try {
      // Sign in first
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: requestData!.owner_email,
        password,
      });

      if (signInError) {
        throw new Error('Failed to authenticate');
      }

      const response = await fetch(
        'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/send-agent-invites',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${signInData.session?.access_token}`,
          },
          body: JSON.stringify({
            agencyId,
            invites: invites.map((i) => ({ email: i.email, role: i.role })),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invites');
      }

      toast.success(`${invites.length} invite(s) sent successfully!`);
      setStep('complete');
    } catch (err) {
      console.error('Invite error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setSendingInvites(false);
    }
  };

  const handleGoToDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session && requestData) {
      await supabase.auth.signInWithPassword({
        email: requestData.owner_email,
        password,
      });
    }
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !requestData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Invalid Link</h2>
            <p className="text-muted-foreground mb-6">
              {error || 'This setup link is invalid or has expired.'}
            </p>
            <Button onClick={() => navigate('/auth')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <LogoIcon className="w-12 h-12" />
            <span className="font-bold text-2xl">Trucking Lane</span>
          </div>
          <p className="text-muted-foreground">
            {step === 'setup' && 'Complete your account setup'}
            {step === 'invite' && 'Invite your team'}
            {step === 'complete' && 'You\'re all set!'}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className={`flex items-center gap-2 ${step === 'setup' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'setup' ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground'
            }`}>
              {step === 'setup' ? '1' : <Check className="h-4 w-4" />}
            </div>
            <span className="text-sm font-medium hidden sm:inline">Account Setup</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={`flex items-center gap-2 ${step === 'invite' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'invite' || step === 'complete' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              {step === 'complete' ? <Check className="h-4 w-4" /> : '2'}
            </div>
            <span className="text-sm font-medium hidden sm:inline">Invite Team</span>
          </div>
        </div>

        {/* Step 1: Account Setup */}
        {step === 'setup' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {requestData.agency_name}
              </CardTitle>
              <CardDescription>
                Set your password to complete your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Owner Name</Label>
                <Input value={requestData.owner_name} disabled className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={requestData.owner_email} disabled className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Create Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>

              <Button
                onClick={handleCompleteSetup}
                disabled={submitting}
                className="w-full mt-4"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Invite Team */}
        {step === 'invite' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Invite Your Team
              </CardTitle>
              <CardDescription>
                Add team members to {requestData.agency_name}. You can also do this later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  placeholder="agent@company.com"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && addInvite()}
                />
                <Select value={newInviteRole} onValueChange={(v) => setNewInviteRole(v as 'agent' | 'agency_admin')}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="agency_admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="secondary" size="icon" onClick={addInvite}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {invites.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{invite.email}</span>
                        <Badge variant={invite.role === 'agency_admin' ? 'default' : 'secondary'}>
                          {invite.role === 'agency_admin' ? 'Admin' : 'Agent'}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeInvite(invite.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {invites.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No invites added yet</p>
                  <p className="text-sm">Add team members or skip this step</p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep('complete')}
                  disabled={sendingInvites}
                  className="flex-1"
                >
                  Skip for Now
                </Button>
                <Button
                  onClick={handleSendInvites}
                  disabled={sendingInvites}
                  className="flex-1"
                >
                  {sendingInvites ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : invites.length > 0 ? (
                    <>
                      Send {invites.length} Invite{invites.length > 1 ? 's' : ''}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Complete */}
        {step === 'complete' && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Welcome to Trucking Lane!</h2>
              <p className="text-muted-foreground mb-6">
                {requestData.agency_name} is ready to go. Your AI Assistant, Lead Scoring, and Analytics are enabled.
              </p>

              <Button onClick={handleGoToDashboard} className="w-full" size="lg">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
