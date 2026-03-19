import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, CheckCircle, XCircle, Archive, Upload, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LogEntry {
  id: string;
  sender_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  imported_count: number | null;
  created_at: string;
}

interface LoadActivityLogsProps {
  agencyId: string;
}

export function LoadActivityLogs({ agencyId }: LoadActivityLogsProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['load_activity_logs', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_import_logs')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as LogEntry[];
    },
    enabled: !!agencyId,
    refetchInterval: 30000,
  });

  const getIcon = (senderEmail: string, status: string) => {
    if (status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
    if (senderEmail.includes('daily-archive')) return <Archive className="h-4 w-4 text-amber-500" />;
    return <Upload className="h-4 w-4 text-green-500" />;
  };

  const getEventLabel = (senderEmail: string) => {
    if (senderEmail.includes('daily-archive')) return 'Nightly Clear';
    if (senderEmail.includes('oldcastle')) return 'Oldcastle Sync';
    if (senderEmail.includes('email-import')) return 'Email Import';
    if (senderEmail.includes('adelphia') || senderEmail.includes('vms') || senderEmail.includes('aljex')) {
      const source = senderEmail.split('@')[0].replace(/-/g, ' ');
      return source.charAt(0).toUpperCase() + source.slice(1);
    }
    return 'Load Import';
  };

  const getBadgeVariant = (senderEmail: string, status: string) => {
    if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
    if (senderEmail.includes('daily-archive')) {
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Archive</Badge>;
    }
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Import</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Load Activity Log
        </CardTitle>
        <CardDescription>
          Recent load imports, syncs, and nightly clears
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No load activity yet</p>
            <p className="text-sm">Imports and nightly clears will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="mt-0.5">{getIcon(log.sender_email, log.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {getEventLabel(log.sender_email)}
                    </span>
                    {getBadgeVariant(log.sender_email, log.status)}
                    {log.imported_count !== null && log.imported_count > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {log.imported_count} loads
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="truncate max-w-[250px]">
                      {log.subject || 'No details'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {log.error_message && (
                    <p className="mt-1 text-xs text-destructive line-clamp-2">
                      {log.error_message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
