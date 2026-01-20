import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, Truck, Package, Globe, Search,
  Plus, ArrowRight, Phone, Mail, ExternalLink 
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
import { useQuery } from '@tanstack/react-query';
import { LeadGenLayout } from '@/components/leadgen/LeadGenLayout';
import { FitScoreInline } from '@/components/leadgen/FitScoreBadge';

interface ScoreBreakdown {
  commodity?: number;
  equipment?: number;
  fmcsa?: number;
  geography?: number;
  scale?: number;
  website?: number;
}

interface Account {
  id: string;
  name: string;
  website: string | null;
  type: string;
  source: string;
  commodities: string[];
  equipment_types: string[];
  regions: string[];
  contact_email: string | null;
  contact_phone: string | null;
  mc_number: string | null;
  dot_number: string | null;
  fit_score: number;
  fit_score_breakdown: ScoreBreakdown | null;
  ai_notes: string | null;
  created_at: string;
}

export default function Accounts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<string>('all');

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

  // Fetch accounts
  const { data: accounts, isLoading, refetch } = useQuery({
    queryKey: ['accounts', agencyMember?.agency_id, typeFilter, scoreFilter],
    queryFn: async () => {
      if (!agencyMember?.agency_id) return [];
      
      let query = supabase
        .from('accounts')
        .select('*')
        .eq('agency_id', agencyMember.agency_id)
        .order('fit_score', { ascending: false })
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter);
      }

      if (scoreFilter === 'high') {
        query = query.gte('fit_score', 80);
      } else if (scoreFilter === 'medium') {
        query = query.gte('fit_score', 50).lt('fit_score', 80);
      } else if (scoreFilter === 'low') {
        query = query.lt('fit_score', 50);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!agencyMember?.agency_id
  });

  const filteredAccounts = accounts?.filter(account => 
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.website?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.mc_number?.includes(searchTerm) ||
    account.dot_number?.includes(searchTerm)
  ) || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'broker': return <Building2 className="h-4 w-4" />;
      case 'carrier': return <Truck className="h-4 w-4" />;
      case 'shipper': return <Package className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'broker': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'carrier': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'shipper': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'High';
    if (score >= 50) return 'Medium';
    return 'Low';
  };

  return (
    <LeadGenLayout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Accounts</h1>
            <p className="text-muted-foreground mt-1">
              {filteredAccounts.length} accounts found
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/prospecting')} variant="outline">
              Prospecting Queue
            </Button>
            <Button onClick={() => navigate('/lead-discovery')}>
              <Plus className="mr-2 h-4 w-4" />
              Discover New
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
                  placeholder="Search by name, website, MC, or DOT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="broker">Brokers</SelectItem>
                  <SelectItem value="carrier">Carriers</SelectItem>
                  <SelectItem value="shipper">Shippers</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Score" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scores</SelectItem>
                  <SelectItem value="high">High (80+)</SelectItem>
                  <SelectItem value="medium">Medium (50-79)</SelectItem>
                  <SelectItem value="low">Low (&lt;50)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Accounts List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading accounts...</div>
        ) : filteredAccounts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Accounts Found</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {searchTerm || typeFilter !== 'all' || scoreFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Start by discovering new accounts'}
              </p>
              <Button onClick={() => navigate('/lead-discovery')}>
                <Plus className="mr-2 h-4 w-4" />
                Discover Accounts
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredAccounts.map((account) => (
              <Card 
                key={account.id} 
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/accounts/${account.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{account.name}</h3>
                        <Badge variant="outline" className={getTypeColor(account.type)}>
                          {getTypeIcon(account.type)}
                          <span className="ml-1 capitalize">{account.type}</span>
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {account.source}
                        </Badge>
                      </div>
                      
                      {account.website && (
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {account.website}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-2 mb-2">
                        {account.mc_number && (
                          <Badge variant="outline" className="text-xs">
                            MC-{account.mc_number}
                          </Badge>
                        )}
                        {account.dot_number && (
                          <Badge variant="outline" className="text-xs">
                            DOT-{account.dot_number}
                          </Badge>
                        )}
                        {account.commodities.slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs capitalize">
                            {c}
                          </Badge>
                        ))}
                        {account.equipment_types.slice(0, 2).map((e) => (
                          <Badge key={e} variant="outline" className="text-xs capitalize">
                            {e}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {account.contact_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {account.contact_email}
                          </span>
                        )}
                        {account.contact_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {account.contact_phone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <FitScoreInline score={account.fit_score} className="text-2xl" />
                        <div className="text-xs text-muted-foreground">
                          {getScoreLabel(account.fit_score)} Fit
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </LeadGenLayout>
  );
}