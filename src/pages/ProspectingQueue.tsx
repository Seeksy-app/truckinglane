import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Building2, Truck, Package, Globe,
  AlertCircle, Clock, CheckCircle, Pause, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LeadGenLayout } from '@/components/leadgen/LeadGenLayout';
import { FitScoreInline } from '@/components/leadgen/FitScoreBadge';
import { format } from 'date-fns';

interface QueueItem {
  id: string;
  account_id: string;
  priority: 'low' | 'medium' | 'high';
  reason: string | null;
  status: 'new' | 'reviewing' | 'contacted' | 'paused' | 'rejected';
  created_at: string;
  accounts: {
    id: string;
    name: string;
    type: string;
    fit_score: number;
    contact_email: string | null;
    contact_phone: string | null;
  };
}

export default function ProspectingQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Get user's agency_id
  const { data: agencyMember } = useQuery({
    queryKey: ['agency-member', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('agency_members')
        .select('agency_id')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id
  });

  // Fetch queue items
  const { data: queueItems, isLoading } = useQuery({
    queryKey: ['prospecting-queue', agencyMember?.agency_id, priorityFilter, statusFilter],
    queryFn: async () => {
      if (!agencyMember?.agency_id) return [];
      
      let query = supabase
        .from('prospecting_queue')
        .select(`
          *,
          accounts (
            id,
            name,
            type,
            fit_score,
            contact_email,
            contact_phone
          )
        `)
        .eq('agency_id', agencyMember.agency_id)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as QueueItem[];
    },
    enabled: !!agencyMember?.agency_id
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('prospecting_queue')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-queue'] });
      toast({ title: 'Status Updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const filteredItems = queueItems?.filter(item => 
    item.accounts?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'broker': return <Building2 className="h-4 w-4" />;
      case 'carrier': return <Truck className="h-4 w-4" />;
      case 'shipper': return <Package className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case 'reviewing': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'contacted': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'paused': return <Pause className="h-4 w-4 text-muted-foreground" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  // Group by priority
  const highPriority = filteredItems.filter(i => i.priority === 'high');
  const mediumPriority = filteredItems.filter(i => i.priority === 'medium');
  const lowPriority = filteredItems.filter(i => i.priority === 'low');

  const renderQueueItem = (item: QueueItem) => (
    <Card 
      key={item.id}
      className="hover:border-primary/50 transition-colors"
    >
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              {getStatusIcon(item.status)}
              {getTypeIcon(item.accounts?.type || 'unknown')}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 
                  className="font-semibold cursor-pointer hover:text-primary"
                  onClick={() => navigate(`/accounts/${item.account_id}`)}
                >
                  {item.accounts?.name || 'Unknown Account'}
                </h3>
                <Badge variant="outline" className={getPriorityColor(item.priority)}>
                  {item.priority}
                </Badge>
              </div>
              
              {item.reason && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {item.reason}
                </p>
              )}
              
              <div className="text-xs text-muted-foreground mt-1">
                Added {format(new Date(item.created_at), 'MMM d, yyyy')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <FitScoreInline score={item.accounts?.fit_score || 0} className="text-xl" />
            
            <Select 
              value={item.status} 
              onValueChange={(value) => updateStatusMutation.mutate({ id: item.id, status: value })}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/accounts/${item.account_id}`)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <LeadGenLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Prospecting Queue</h1>
            <p className="text-muted-foreground mt-1">
              {filteredItems.length} accounts to prospect
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/accounts')} variant="outline">
              All Accounts
            </Button>
            <Button onClick={() => navigate('/lead-discovery')}>
              Discover More
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading queue...</div>
        ) : filteredItems.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Prospects in Queue</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {searchTerm || priorityFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Discover and score accounts to add them to your prospecting queue'}
              </p>
              <Button onClick={() => navigate('/lead-discovery')}>
                Discover Accounts
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* High Priority */}
            {highPriority.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-red-500 mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  High Priority ({highPriority.length})
                </h2>
                <div className="space-y-3">
                  {highPriority.map(renderQueueItem)}
                </div>
              </div>
            )}

            {/* Medium Priority */}
            {mediumPriority.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-yellow-500 mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Medium Priority ({mediumPriority.length})
                </h2>
                <div className="space-y-3">
                  {mediumPriority.map(renderQueueItem)}
                </div>
              </div>
            )}

            {/* Low Priority */}
            {lowPriority.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-muted-foreground mb-4">
                  Low Priority ({lowPriority.length})
                </h2>
                <div className="space-y-3">
                  {lowPriority.map(renderQueueItem)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </LeadGenLayout>
  );
}