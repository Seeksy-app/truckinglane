import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Building2, Truck, Package, Globe, Star, 
  Phone, Mail, ExternalLink, RefreshCw, Plus, X, 
  CheckCircle, Clock, FileText, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LeadGenLayout } from '@/components/leadgen/LeadGenLayout';
import { FitScoreBadge } from '@/components/leadgen/FitScoreBadge';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AccountEvent {
  id: string;
  event_type: string;
  meta: Record<string, any>;
  created_at: string;
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEnriching, setIsEnriching] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [newNote, setNewNote] = useState('');

  // Fetch account
  const { data: account, isLoading } = useQuery({
    queryKey: ['account', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  // Fetch account events
  const { data: events } = useQuery({
    queryKey: ['account-events', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('account_events')
        .select('*')
        .eq('account_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as AccountEvent[];
    },
    enabled: !!id
  });

  // Check if in prospecting queue
  const { data: queueEntry } = useQuery({
    queryKey: ['prospecting-queue-entry', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase
        .from('prospecting_queue')
        .select('*')
        .eq('account_id', id)
        .single();
      return data;
    },
    enabled: !!id
  });

  const handleEnrich = async () => {
    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-account-fmcsa', {
        body: { account_id: id }
      });

      if (error) throw error;

      if (data.success) {
        toast({ title: 'Enrichment Complete', description: data.notes?.join(', ') || 'Account enriched with FMCSA data' });
        queryClient.invalidateQueries({ queryKey: ['account', id] });
        queryClient.invalidateQueries({ queryKey: ['account-events', id] });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: 'Enrichment Failed',
        description: error.message || 'Failed to enrich account',
        variant: 'destructive'
      });
    } finally {
      setIsEnriching(false);
    }
  };

  const handleScore = async () => {
    setIsScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('score-account-fit', {
        body: { account_id: id, auto_queue: true }
      });

      if (error) throw error;

      if (data.success) {
        toast({ 
          title: 'Scoring Complete', 
          description: `Fit score: ${data.fit_score}${data.queued ? ' - Added to prospecting queue' : ''}`
        });
        queryClient.invalidateQueries({ queryKey: ['account', id] });
        queryClient.invalidateQueries({ queryKey: ['account-events', id] });
        queryClient.invalidateQueries({ queryKey: ['prospecting-queue-entry', id] });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: 'Scoring Failed',
        description: error.message || 'Failed to score account',
        variant: 'destructive'
      });
    } finally {
      setIsScoring(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !account) return;

    try {
      const { error } = await supabase
        .from('accounts')
        .update({ 
          notes: account.notes ? `${account.notes}\n\n${newNote}` : newNote,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      await supabase.from('account_events').insert({
        account_id: id,
        event_type: 'note_added',
        meta: { note: newNote.substring(0, 100) }
      });

      toast({ title: 'Note Added' });
      setNewNote('');
      queryClient.invalidateQueries({ queryKey: ['account', id] });
      queryClient.invalidateQueries({ queryKey: ['account-events', id] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleAddToQueue = async () => {
    if (!account) return;

    try {
      const { error } = await supabase.from('prospecting_queue').insert({
        account_id: id,
        agency_id: account.agency_id,
        priority: account.fit_score >= 80 ? 'high' : account.fit_score >= 60 ? 'medium' : 'low',
        reason: 'Manually added',
        status: 'new'
      });

      if (error) throw error;

      toast({ title: 'Added to Prospecting Queue' });
      queryClient.invalidateQueries({ queryKey: ['prospecting-queue-entry', id] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    try {
      await supabase.from('account_events').insert({
        account_id: id,
        event_type: 'rejected',
        meta: { reason: 'Manual rejection' }
      });

      // Remove from queue if present
      if (queueEntry) {
        await supabase.from('prospecting_queue').delete().eq('account_id', id);
      }

      toast({ title: 'Account Rejected' });
      queryClient.invalidateQueries({ queryKey: ['account-events', id] });
      queryClient.invalidateQueries({ queryKey: ['prospecting-queue-entry', id] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'broker': return <Building2 className="h-5 w-5" />;
      case 'carrier': return <Truck className="h-5 w-5" />;
      case 'shipper': return <Package className="h-5 w-5" />;
      default: return <Globe className="h-5 w-5" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500 bg-green-500/10';
    if (score >= 50) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-muted-foreground bg-muted';
  };

  const canAddToQueue = account ? account.fit_score >= 40 : false;

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'discovered': return <Plus className="h-4 w-4 text-blue-500" />;
      case 'enriched': return <RefreshCw className="h-4 w-4 text-green-500" />;
      case 'scored': return <Star className="h-4 w-4 text-yellow-500" />;
      case 'queued': return <CheckCircle className="h-4 w-4 text-primary" />;
      case 'rejected': return <X className="h-4 w-4 text-red-500" />;
      case 'note_added': return <FileText className="h-4 w-4 text-muted-foreground" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <LeadGenLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12 text-muted-foreground">Loading account...</div>
        </div>
      </LeadGenLayout>
    );
  }

  if (!account) {
    return (
      <LeadGenLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">Account Not Found</h2>
            <Button onClick={() => navigate('/accounts')}>Back to Accounts</Button>
          </div>
        </div>
      </LeadGenLayout>
    );
  }

  return (
    <LeadGenLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <button onClick={() => navigate('/dashboard')} className="hover:text-foreground transition-colors">
            Dashboard
          </button>
          <span>/</span>
          <span>Lead Gen</span>
          <span>/</span>
          <button onClick={() => navigate('/accounts')} className="hover:text-foreground transition-colors">
            Accounts
          </button>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{account.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                {getTypeIcon(account.type)}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{account.name}</h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline" className="capitalize">{account.type}</Badge>
                  <span>•</span>
                  <span className="text-sm">Source: {account.source}</span>
                </div>
              </div>
            </div>
          </div>

          <FitScoreBadge 
            score={account.fit_score} 
            breakdown={account.fit_score_breakdown as any} 
            showBreakdown 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact & Identity */}
            <Card>
              <CardHeader>
                <CardTitle>Contact & Identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {account.website && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Website</div>
                      <a 
                        href={account.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {account.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {account.contact_email && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Email</div>
                      <a href={`mailto:${account.contact_email}`} className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {account.contact_email}
                      </a>
                    </div>
                  )}
                  {account.contact_phone && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Phone</div>
                      <a href={`tel:${account.contact_phone}`} className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {account.contact_phone}
                      </a>
                    </div>
                  )}
                  {account.mc_number && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">MC Number</div>
                      <span className="font-mono">MC-{account.mc_number}</span>
                    </div>
                  )}
                  {account.dot_number && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">DOT Number</div>
                      <span className="font-mono">DOT-{account.dot_number}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Business Details */}
            <Card>
              <CardHeader>
                <CardTitle>Business Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {account.commodities.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Commodities</div>
                    <div className="flex flex-wrap gap-2">
                      {account.commodities.map((c) => (
                        <Badge key={c} variant="secondary" className="capitalize">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {account.equipment_types.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Equipment Types</div>
                    <div className="flex flex-wrap gap-2">
                      {account.equipment_types.map((e) => (
                        <Badge key={e} variant="outline" className="capitalize">{e}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {account.regions.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Regions</div>
                    <div className="flex flex-wrap gap-2">
                      {account.regions.map((r) => (
                        <Badge key={r} variant="outline">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Notes */}
            {account.ai_notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    AI Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm font-mono bg-muted p-4 rounded-lg">
                    {account.ai_notes}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {account.notes && (
                  <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm">
                    {account.notes}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                  />
                  <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={handleEnrich} 
                  disabled={isEnriching || (!account.mc_number && !account.dot_number)}
                  className="w-full"
                  variant="outline"
                >
                  {isEnriching ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Enrich from FMCSA
                </Button>
                
                <Button 
                  onClick={handleScore} 
                  disabled={isScoring}
                  className="w-full"
                  variant="outline"
                >
                  {isScoring ? (
                    <Star className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Star className="mr-2 h-4 w-4" />
                  )}
                  Recalculate Score
                </Button>

                <Separator />

                {!queueEntry ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full">
                          <Button 
                            onClick={handleAddToQueue}
                            className="w-full"
                            disabled={!canAddToQueue}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add to Prospecting Queue
                          </Button>
                        </div>
                      </TooltipTrigger>
                      {!canAddToQueue && (
                        <TooltipContent>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                            <span>Fit Score must be 40+ to add to queue</span>
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div className="p-3 bg-primary/10 rounded-lg text-center">
                    <CheckCircle className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <div className="text-sm font-medium">In Prospecting Queue</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      Status: {queueEntry.status} • Priority: {queueEntry.priority}
                    </div>
                  </div>
                )}

                <Button 
                  onClick={handleReject}
                  variant="destructive"
                  className="w-full"
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject Account
                </Button>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {events?.map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <div className="mt-1">{getEventIcon(event.event_type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium capitalize">
                          {event.event_type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(event.created_at), 'MMM d, h:mm a')}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {(!events || events.length === 0) && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No activity yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </LeadGenLayout>
  );
}