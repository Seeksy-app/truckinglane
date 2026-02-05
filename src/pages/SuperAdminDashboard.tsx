import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Building2,
  Users,
  Phone,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  FileText,
  ArrowRight,
  Mail,
  Link,
  Copy,
  Send,
  Shield,
  Settings,
  ChevronDown,
  ChevronRight,
  Briefcase,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AppHeader } from '@/components/AppHeader';
import { SystemHealthDashboard } from '@/components/admin/SystemHealthDashboard';
import { TrustPageAdmin } from '@/components/admin/TrustPageAdmin';
import { PlatformAnalytics } from '@/components/admin/PlatformAnalytics';
import { InviteSuperAdminDialog } from '@/components/admin/InviteSuperAdminDialog';
import { AgencyEmailImportSettings } from '@/components/admin/AgencyEmailImportSettings';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Agency {
  id: string;
  name: string;
  created_at: string;
  member_count?: number;
  call_count?: number;
  lead_count?: number;
  import_email_code?: string | null;
  allowed_sender_domains?: string[] | null;
}

interface AgencyRequest {
  id: string;
  agency_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  owner_address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  agent_count: string | null;
  daily_load_volume: string | null;
  status: string;
  created_at: string;
  approval_token: string | null;
  reviewed_at: string | null;
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setImpersonation } = useImpersonation();
  
  const [selectedRequest, setSelectedRequest] = useState<AgencyRequest | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedAgencyId, setExpandedAgencyId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Redirect if not super admin
  if (!roleLoading && role !== 'super_admin') {
    navigate('/dashboard');
    return null;
  }

  // Fetch all super admins
  const { data: superAdmins = [], isLoading: superAdminsLoading } = useQuery({
    queryKey: ['super_admin_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_members')
        .select(`
          id,
          user_id,
          created_at,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .eq('role', 'super_admin')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: role === 'super_admin',
  });

  // Fetch all agencies with stats
  const { data: agencies = [], isLoading: agenciesLoading } = useQuery({
    queryKey: ['super_admin_agencies'],
    queryFn: async () => {
      const { data: agenciesData, error } = await supabase
        .from('agencies')
        .select('id, name, created_at, import_email_code, allowed_sender_domains')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch stats for each agency
      const agenciesWithStats: Agency[] = [];
      for (const agency of agenciesData || []) {
        const [membersRes, callsRes, leadsRes] = await Promise.all([
          supabase.from('agency_members').select('id', { count: 'exact' }).eq('agency_id', agency.id),
          supabase.from('ai_call_summaries').select('id', { count: 'exact' }).eq('agency_id', agency.id),
          supabase.from('leads').select('id', { count: 'exact' }).eq('agency_id', agency.id),
        ]);
        
        agenciesWithStats.push({
          ...agency,
          member_count: membersRes.count || 0,
          call_count: callsRes.count || 0,
          lead_count: leadsRes.count || 0,
        });
      }
      
      return agenciesWithStats;
    },
    enabled: role === 'super_admin',
  });

  // Fetch pending agency requests
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['agency_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as AgencyRequest[];
    },
    enabled: role === 'super_admin',
  });

  // Fetch approved requests awaiting setup (have approval_token but no agency created yet)
  const { data: approvedRequests = [] } = useQuery({
    queryKey: ['approved_agency_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_requests')
        .select('*')
        .eq('status', 'approved')
        .not('approval_token', 'is', null)
        .order('reviewed_at', { ascending: false });
      
      if (error) throw error;
      return data as AgencyRequest[];
    },
    enabled: role === 'super_admin',
  });

  const copySetupLink = (token: string) => {
    const url = `${window.location.origin}/complete-agency-setup?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Setup link copied to clipboard');
  };

  // Approve agency request
  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      setActionLoading(true);
      const { data, error } = await supabase.functions.invoke('approve-agency-request', {
        body: { requestId, action: 'approve' },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Agency request approved! Email sent to owner.');
      queryClient.invalidateQueries({ queryKey: ['agency_requests'] });
      setSelectedRequest(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve request');
    },
    onSettled: () => {
      setActionLoading(false);
    },
  });

  // Reject agency request
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      setActionLoading(true);
      const { data, error } = await supabase.functions.invoke('approve-agency-request', {
        body: { requestId, action: 'reject', reason },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Agency request rejected');
      queryClient.invalidateQueries({ queryKey: ['agency_requests'] });
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectReason('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject request');
    },
    onSettled: () => {
      setActionLoading(false);
    },
  });

  const handleImpersonate = (agency: Agency) => {
    setImpersonation(agency.id, agency.name);
    toast.success(`Now viewing ${agency.name}`);
    navigate('/dashboard');
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalAgents = agencies.reduce((sum, a) => sum + (a.member_count || 0), 0);
  const totalCalls = agencies.reduce((sum, a) => sum + (a.call_count || 0), 0);
  const totalLeads = agencies.reduce((sum, a) => sum + (a.lead_count || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Platform Overview</h1>
            <p className="text-muted-foreground mt-1">Manage agencies and monitor platform health</p>
          </div>
          <InviteSuperAdminDialog />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{agencies.length}</p>
                  <p className="text-sm text-muted-foreground">Agencies</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAgents}</p>
                  <p className="text-sm text-muted-foreground">Total Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Phone className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalCalls}</p>
                  <p className="text-sm text-muted-foreground">AI Calls</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <TrendingUp className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalLeads}</p>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Super Admins Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Platform Super Admins ({superAdmins.length})
            </CardTitle>
            <CardDescription>
              Users with full platform access
            </CardDescription>
          </CardHeader>
          <CardContent>
            {superAdminsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : superAdmins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No super admins found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {superAdmins.map((admin) => {
                    const profile = admin.profiles as { email?: string; full_name?: string } | null;
                    return (
                      <TableRow key={admin.id}>
                        <TableCell className="font-medium">
                          {profile?.full_name || 'Unknown'}
                        </TableCell>
                        <TableCell>{profile?.email || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(admin.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pending Approval Requests */}
        {requests.length > 0 && (
          <Card className="border-amber-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                <Clock className="h-5 w-5" />
                Pending Agency Requests ({requests.length})
              </CardTitle>
              <CardDescription>
                New agencies waiting for your approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency Name</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium">{request.agency_name}</div>
                        {request.city && request.state && (
                          <div className="text-xs text-muted-foreground">
                            {request.city}, {request.state}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{request.owner_name}</div>
                        {request.owner_phone && (
                          <div className="text-xs text-muted-foreground">{request.owner_phone}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{request.owner_email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {request.agent_count && (
                            <Badge variant="secondary" className="text-xs">
                              {request.agent_count} agents
                            </Badge>
                          )}
                          {request.daily_load_volume && (
                            <Badge variant="outline" className="text-xs block w-fit">
                              {request.daily_load_volume} loads/day
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => approveMutation.mutate(request.id)}
                            disabled={actionLoading}
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedRequest(request);
                              setRejectDialogOpen(true);
                            }}
                            disabled={actionLoading}
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Approved - Awaiting Setup */}
        {approvedRequests.length > 0 && (
          <Card className="border-blue-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600">
                <Mail className="h-5 w-5" />
                Approved - Awaiting Setup ({approvedRequests.length})
              </CardTitle>
              <CardDescription>
                Agencies approved but owner hasn't completed account setup yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency Name</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium">{request.agency_name}</div>
                        {request.city && request.state && (
                          <div className="text-xs text-muted-foreground">
                            {request.city}, {request.state}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{request.owner_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{request.owner_email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.reviewed_at 
                          ? new Date(request.reviewed_at).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {request.approval_token && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => copySetupLink(request.approval_token!)}
                            >
                              <Copy className="h-4 w-4" />
                              Copy Link
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Agencies List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              All Agencies
            </CardTitle>
            <CardDescription>
              Click "View" to impersonate and see an agency's dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            {agenciesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : agencies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No agencies yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead className="text-center">Agents</TableHead>
                    <TableHead className="text-center">AI Calls</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencies.map((agency) => {
                    const isExpanded = expandedAgencyId === agency.id;
                    return (
                      <>
                        <TableRow key={agency.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setExpandedAgencyId(isExpanded ? null : agency.id)}
                                className="p-1 hover:bg-muted rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              {agency.name}
                              {agency.import_email_code && (
                                <Badge variant="outline" className="text-xs ml-2">
                                  Email Import
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{agency.member_count}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{agency.call_count}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{agency.lead_count}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(agency.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                onClick={() => setExpandedAgencyId(isExpanded ? null : agency.id)}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                onClick={() => handleImpersonate(agency)}
                              >
                                <Eye className="h-4 w-4" />
                                View
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${agency.id}-settings`}>
                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                              <AgencyEmailImportSettings 
                                agency={agency} 
                                onUpdate={() => queryClient.invalidateQueries({ queryKey: ['super_admin_agencies'] })}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Platform Analytics */}
        <PlatformAnalytics />

        {/* Business Development */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Business Development
            </CardTitle>
            <CardDescription>
              Strategic planning, projections, and go-to-market strategy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/business-development')} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              View Business Development Dashboard
            </Button>
          </CardContent>
        </Card>

        {/* System Health & Trust Page Admin */}
        <SystemHealthDashboard />
        <TrustPageAdmin />
      </main>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Agency Request</DialogTitle>
            <DialogDescription>
              Rejecting request for "{selectedRequest?.agency_name}" by {selectedRequest?.owner_name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRequest) {
                  rejectMutation.mutate({ requestId: selectedRequest.id, reason: rejectReason });
                }
              }}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
