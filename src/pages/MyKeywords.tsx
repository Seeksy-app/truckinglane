import { AppHeader } from '@/components/AppHeader';
import { HighIntentKeywords } from '@/components/dashboard/HighIntentKeywords';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function MyKeywords() {
  const { user } = useAuth();

  // Fetch agency ID for the current user
  const { data: agencyId, isLoading } = useQuery({
    queryKey: ['user-agency', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('agency_members')
        .select('agency_id')
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data?.agency_id;
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">My High-Intent Keywords</h1>
          <p className="text-muted-foreground mt-1">
            Add keywords to automatically flag leads as high-intent when detected in call transcripts.
          </p>
        </div>
        <HighIntentKeywords agencyId={agencyId || null} userId={user?.id || null} />
      </main>
    </div>
  );
}
