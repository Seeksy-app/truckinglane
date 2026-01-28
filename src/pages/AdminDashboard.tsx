import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  Users, Plus, Copy, Check, 
  Loader2, UserPlus, Mail, Building2, RefreshCw, Clock, KeyRound
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AppHeader } from '@/components/AppHeader';
import { TrustPageAdmin } from '@/components/admin/TrustPageAdmin';
import { SystemHealthDashboard } from '@/components/admin/SystemHealthDashboard';
import { EmailImportLogs } from '@/components/admin/EmailImportLogs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Agent {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: {
    email: string | null;
    full_name: string | null;
  };
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  token: string;
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const { role, agencyId, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  
  const [agentEmail, setAgentEmail] = useState('');
  const [agentName, setAgentName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agencyName, setAgencyName] = useState('');
  const [resending, setResending] = useState<string | null>(null);
  const [sendingLoginEmail, setSendingLoginEmail] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordAgent, setPasswordAgent] = useState<Agent | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const isSuperAdmin = role === 'super_admin';

  // Redirect if not admin
  useEffect(() => {
    if (!roleLoading && role !== 'agency_admin' && role !== 'super_admin') {
      navigate('/dashboard');
    }
  }, [role, roleLoading, navigate]);

  // Fetch agency info, agents, and pending invites
  useEffect(() => {
    async function fetchData() {
      if (!agencyId) return;

      try {
        // Fetch agency name
        const { data: agency } = await supabase
          .from('agencies')
          .select('name')
          .eq('id', agencyId)
          .single();
        
        if (agency) {
          setAgencyName(agency.name);
        }

        // Fetch agents
        const { data: members, error } = await supabase
          .from('agency_members')
          .select(`
            id,
            user_id,
            role,
            created_at
          `)
          .eq('agency_id', agencyId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching agents:', error);
          return;
        }

        // Fetch profiles for each member
        const agentsWithProfiles: Agent[] = [];
        for (const member of members || []) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', member.user_id)
            .single();

          agentsWithProfiles.push({
            ...member,
            profile: profile || undefined,
          });
        }

        setAgents(agentsWithProfiles);

        // Fetch pending invites
        const { data: invites, error: invitesError } = await supabase
          .from('agent_invites')
          .select('*')
          .eq('agency_id', agencyId)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (!invitesError && invites) {
          setPendingInvites(invites);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoadingAgents(false);
      }
    }

    fetchData();
  }, [agencyId]);

  const handleInviteAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agentEmail.trim()) {
      toast.error('Please enter an email');
      return;
    }

    if (!agencyId) {
      toast.error('No agency found');
      return;
    }

    setInviting(true);
    try {
      // Use send-agent-invites to create invite and send email
      const { data, error } = await supabase.functions.invoke('send-agent-invites', {
        body: { 
          agencyId,
          invites: [{ email: agentEmail, role: 'agent' }]
        },
      });

      if (error) {
        toast.error(error.message || 'Failed to invite agent');
        return;
      }

      if (data?.results?.[0]?.success === false) {
        toast.error(data.results[0].error || 'Failed to invite agent');
        return;
      }

      toast.success(`Invitation sent to ${agentEmail}!`);
      setAgentEmail('');
      setAgentName('');
      
      // Refresh invites list
      const { data: invites } = await supabase
        .from('agent_invites')
        .select('*')
        .eq('agency_id', agencyId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      
      if (invites) {
        setPendingInvites(invites);
      }
    } catch (err) {
      console.error('Error inviting agent:', err);
      toast.error('Failed to invite agent');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvite = async (invite: PendingInvite) => {
    if (!agencyId) return;
    
    setResending(invite.id);
    try {
      // Delete old invite and create new one
      await supabase
        .from('agent_invites')
        .delete()
        .eq('id', invite.id);

      // Send new invite
      const { data, error } = await supabase.functions.invoke('send-agent-invites', {
        body: { 
          agencyId,
          invites: [{ email: invite.email, role: invite.role as 'agent' | 'agency_admin' }]
        },
      });

      if (error || data?.results?.[0]?.success === false) {
        toast.error('Failed to resend invite');
        return;
      }

      toast.success(`Invitation resent to ${invite.email}!`);
      
      // Refresh invites list
      const { data: invites } = await supabase
        .from('agent_invites')
        .select('*')
        .eq('agency_id', agencyId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      
      if (invites) {
        setPendingInvites(invites);
      }
    } catch (err) {
      console.error('Error resending invite:', err);
      toast.error('Failed to resend invite');
    } finally {
      setResending(null);
    }
  };

  const handleSendLoginEmail = async (agent: Agent) => {
    if (!agencyId || !agent.profile?.email) return;
    
    setSendingLoginEmail(agent.id);
    try {
      // Send login email via send-agent-invites (creates invite record and sends email)
      const { data, error } = await supabase.functions.invoke('send-agent-invites', {
        body: { 
          agencyId,
          invites: [{ email: agent.profile.email, role: agent.role as 'agent' | 'agency_admin' }]
        },
      });

      if (error || data?.results?.[0]?.success === false) {
        toast.error(data?.results?.[0]?.error || 'Failed to send login email');
        return;
      }

      toast.success(`Login email sent to ${agent.profile.email}!`);
      
      // Refresh invites list
      const { data: invites } = await supabase
        .from('agent_invites')
        .select('*')
        .eq('agency_id', agencyId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      
      if (invites) {
        setPendingInvites(invites);
      }
    } catch (err) {
      console.error('Error sending login email:', err);
      toast.error('Failed to send login email');
    } finally {
      setSendingLoginEmail(null);
    }
  };

  const copyLoginLink = (email: string) => {
    const link = `${window.location.origin}/auth?email=${encodeURIComponent(email)}`;
    navigator.clipboard.writeText(link);
    setCopied(email);
    toast.success('Login link copied!');
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSetPassword = async () => {
    if (!passwordAgent?.user_id || !newPassword) return;
    
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-user-password', {
        body: { 
          userId: passwordAgent.user_id,
          password: newPassword
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Failed to set password');
        return;
      }

      toast.success(`Password set for ${passwordAgent.profile?.email || 'user'}!`);
      setPasswordModalOpen(false);
      setPasswordAgent(null);
      setNewPassword('');
    } catch (err) {
      console.error('Error setting password:', err);
      toast.error('Failed to set password');
    } finally {
      setSettingPassword(false);
    }
  };

  const openPasswordModal = (agent: Agent) => {
    setPasswordAgent(agent);
    setNewPassword('');
    setPasswordModalOpen(true);
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    toast.success('Invite link copied!');
    setTimeout(() => setCopied(null), 2000);
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Agency Info */}
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-2xl font-bold">{agencyName || 'Your Agency'}</h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Add Agent Form */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add New Agent
              </CardTitle>
              <CardDescription>
                Invite an agent to join your agency. They'll receive an email with a link to join.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteAgent} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agentEmail">Agent Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="agentEmail"
                      type="email"
                      value={agentEmail}
                      onChange={(e) => setAgentEmail(e.target.value)}
                      placeholder="agent@company.com"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="agentName">Full Name (optional)</Label>
                  <Input
                    id="agentName"
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>

                <Button type="submit" className="w-full gap-2" disabled={inviting}>
                  {inviting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending Invite...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Send Invite
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Agents List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Manage your agency's agents and admins.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pending Invites */}
              {pendingInvites.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Pending Invites ({pendingInvites.length})
                  </h4>
                  <div className="border rounded-lg divide-y">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="flex items-center justify-between p-3 bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{invite.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Invited {new Date(invite.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            Pending
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyInviteLink(invite.token)}
                            className="gap-1"
                          >
                            {copied === invite.token ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResendInvite(invite)}
                            disabled={resending === invite.id}
                            className="gap-1"
                          >
                            {resending === invite.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3" />
                                Resend
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Members */}
              {loadingAgents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : agents.length === 0 && pendingInvites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No team members yet</p>
                  <p className="text-sm">Add your first agent using the form</p>
                </div>
              ) : agents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => (
                      <TableRow key={agent.id}>
                        <TableCell className="font-medium">
                          {agent.profile?.full_name || '—'}
                        </TableCell>
                        <TableCell>{agent.profile?.email || '—'}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={agent.role === 'agent' ? 'outline' : 'default'}
                            className="capitalize"
                          >
                            {agent.role.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(agent.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.profile?.email && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openPasswordModal(agent)}
                                className="gap-1"
                                title="Set Password"
                              >
                                <KeyRound className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSendLoginEmail(agent)}
                                disabled={sendingLoginEmail === agent.id}
                                className="gap-1"
                              >
                                {sendingLoginEmail === agent.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Mail className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyLoginLink(agent.profile!.email!)}
                                className="gap-1"
                              >
                                {copied === agent.profile.email ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Email Import Logs - visible to agency admins */}
        {agencyId && <EmailImportLogs agencyId={agencyId} />}

        {/* Super Admin Only Sections */}
        {isSuperAdmin && (
          <>
            <SystemHealthDashboard />
            <TrustPageAdmin />
          </>
        )}

      </main>

      {/* Set Password Modal */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>
              Set a password for {passwordAgent?.profile?.full_name || passwordAgent?.profile?.email || 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSetPassword} 
              disabled={settingPassword || newPassword.length < 6}
            >
              {settingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" />
              )}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
