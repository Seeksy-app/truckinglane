import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ImportLog {
  id: string;
  sender_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  imported_count: number | null;
  created_at: string;
}

interface EmailImportLogsProps {
  agencyId: string;
}

export function EmailImportLogs({ agencyId }: EmailImportLogsProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['email_import_logs', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_import_logs')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as ImportLog[];
    },
    enabled: !!agencyId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'rejected':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <Mail className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Email Import History
        </CardTitle>
        <CardDescription>
          Recent load imports received via email
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
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No email imports yet</p>
            <p className="text-sm">Imports will appear here when received</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="mt-0.5">{getStatusIcon(log.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate max-w-[200px]">
                      {log.subject || 'No subject'}
                    </span>
                    {getStatusBadge(log.status)}
                    {log.status === 'success' && log.imported_count !== null && (
                      <Badge variant="secondary" className="text-xs">
                        {log.imported_count} loads
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="truncate max-w-[180px]">{log.sender_email}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
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
