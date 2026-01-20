import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, Loader2, Plus, ArrowRight, Building2, Truck, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { LeadGenLayout } from '@/components/leadgen/LeadGenLayout';

interface DiscoveredAccount {
  id: string;
  name: string;
  website: string;
  type: 'broker' | 'shipper' | 'carrier' | 'unknown';
  commodities: string[];
  equipment_types: string[];
  regions: string[];
  contact_email?: string;
  contact_phone?: string;
  mc_number?: string;
  dot_number?: string;
  fit_score: number;
}

export default function LeadDiscovery() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [urlList, setUrlList] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveredAccount[]>([]);

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

  const handleDiscover = async () => {
    if (!agencyMember?.agency_id) {
      toast({ title: 'Error', description: 'No agency found', variant: 'destructive' });
      return;
    }

    if (!searchQuery.trim() && !urlList.trim()) {
      toast({ title: 'Error', description: 'Enter a search query or URLs', variant: 'destructive' });
      return;
    }

    setIsDiscovering(true);
    setDiscoveryResults([]);

    try {
      const urls = urlList.trim() 
        ? urlList.split('\n').map(u => u.trim()).filter(Boolean) 
        : undefined;

      const { data, error } = await supabase.functions.invoke('discover-accounts', {
        body: {
          query: searchQuery.trim() || undefined,
          urls,
          agency_id: agencyMember.agency_id
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Discovery Complete',
          description: `Found ${data.discovered} accounts, saved ${data.saved} new`
        });
        setDiscoveryResults(data.accounts || []);
      } else {
        throw new Error(data.error || 'Discovery failed');
      }
    } catch (error: any) {
      console.error('Discovery error:', error);
      toast({
        title: 'Discovery Failed',
        description: error.message || 'Failed to discover accounts',
        variant: 'destructive'
      });
    } finally {
      setIsDiscovering(false);
    }
  };

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

  return (
    <LeadGenLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Lead Discovery</h1>
            <p className="text-muted-foreground mt-1">
              Find new broker, shipper, and carrier accounts using AI + public data
            </p>
          </div>
          <Button onClick={() => navigate('/accounts')} variant="outline">
            View All Accounts <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Search Discovery */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Discovery
              </CardTitle>
              <CardDescription>
                Search for freight companies by keyword (e.g., "flatbed carriers Texas")
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isDiscovering}
              />
              <Button 
                onClick={handleDiscover} 
                disabled={isDiscovering || (!searchQuery.trim() && !urlList.trim())}
                className="w-full"
              >
                {isDiscovering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Discover Accounts
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* URL Discovery */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                URL Discovery
              </CardTitle>
              <CardDescription>
                Paste website URLs (one per line) to analyze
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="https://example-freight.com&#10;https://another-trucking.com"
                value={urlList}
                onChange={(e) => setUrlList(e.target.value)}
                disabled={isDiscovering}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Maximum 10 URLs per discovery
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Discovery Results */}
        {discoveryResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Discovery Results</CardTitle>
              <CardDescription>
                {discoveryResults.length} accounts discovered and saved
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {discoveryResults.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{account.name}</h3>
                        <Badge variant="outline" className={getTypeColor(account.type)}>
                          {getTypeIcon(account.type)}
                          <span className="ml-1 capitalize">{account.type}</span>
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2">
                        {account.website}
                      </p>
                      
                      <div className="flex flex-wrap gap-1">
                        {account.commodities.slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">
                            {c}
                          </Badge>
                        ))}
                        {account.equipment_types.slice(0, 2).map((e) => (
                          <Badge key={e} variant="outline" className="text-xs">
                            {e}
                          </Badge>
                        ))}
                        {account.mc_number && (
                          <Badge variant="outline" className="text-xs">
                            MC-{account.mc_number}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/accounts/${account.id}`)}
                    >
                      View <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {discoveryResults.length === 0 && !isDiscovering && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Results Yet</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Enter a search query or paste URLs above to discover new freight accounts.
                We'll analyze each site and extract relevant business information.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </LeadGenLayout>
  );
}