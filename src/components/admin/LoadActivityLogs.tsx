import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, CheckCircle, XCircle, Archive, Upload, Clock, TrendingUp, RefreshCw, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  resolveImportActivityLabel,
  type ImportRunRow,
  type LoadTsRow,
} from '@/lib/loadActivityImportLabels';

interface Breakdown {
  new?: number;
  updated?: number;
  archived?: number;
  duplicates_removed?: number;
  sheets?: number;
  source?: string;
  /** Set on some sync breakdowns (e.g. Google Sheets) */
  template_type?: string;
  // DAT export fields (legacy API push)
  posted?: number;
  already_on_dat?: number;
  failed?: number;
  failed_load_numbers?: string[];
  mode?: string;
  // DAT CSV export (manual download)
  agent_name?: string;
  count?: number;
}

interface LogEntry {
  id: string;
  sender_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  imported_count: number | null;
  raw_headers: Breakdown | null;
  created_at: string;
}

interface LoadActivityLogsProps {
  agencyId: string;
}

type ActivityQueryData = {
  logs: LogEntry[];
  runs: ImportRunRow[];
  loadsWindow: LoadTsRow[];
};

export function LoadActivityLogs({ agencyId }: LoadActivityLogsProps) {
  const { data: activityData, isLoading } = useQuery({
    queryKey: ['load_activity_logs', agencyId],
    queryFn: async (): Promise<ActivityQueryData> => {
      const { data, error } = await supabase
        .from('email_import_logs')
        .select('id, sender_email, subject, status, error_message, imported_count, raw_headers, created_at')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const rows = (data as LogEntry[]).filter((log) => {
        const e = log.sender_email.toLowerCase();
        // Hide legacy automated DAT API push logs (CSV upload replaced this)
        if (e.startsWith("dat-export@")) return false;
        return true;
      });

      if (rows.length === 0) {
        return { logs: [], runs: [], loadsWindow: [] };
      }

      const { data: runsData, error: runsError } = await supabase
        .from('load_import_runs')
        .select('template_type, created_at')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(400);

      if (runsError) throw runsError;

      const logTimes = rows.map((r) => new Date(r.created_at).getTime());
      const minT = Math.min(...logTimes) - 120_000;
      const maxT = Math.max(...logTimes) + 180_000;

      const { data: loadsData, error: loadsError } = await supabase
        .from('loads')
        .select('template_type, updated_at')
        .eq('agency_id', agencyId)
        .gte('updated_at', new Date(minT).toISOString())
        .lte('updated_at', new Date(maxT).toISOString())
        .limit(2000);

      if (loadsError) throw loadsError;

      return {
        logs: rows,
        runs: (runsData ?? []) as ImportRunRow[],
        loadsWindow: (loadsData ?? []) as LoadTsRow[],
      };
    },
    enabled: !!agencyId,
    refetchInterval: 30000,
  });

  const logs = activityData?.logs;
  const runs = activityData?.runs ?? [];
  const loadsWindow = activityData?.loadsWindow ?? [];

  const getIcon = (senderEmail: string, status: string) => {
    if (status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
    if (senderEmail.toLowerCase().startsWith('dat-csv-export@')) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
    if (senderEmail.includes('daily-archive')) return <Archive className="h-4 w-4 text-amber-500" />;
    return <Upload className="h-4 w-4 text-green-500" />;
  };

  const getEventLabel = (senderEmail: string) => {
    if (senderEmail.includes('daily-archive')) return 'Nightly Clear';
    if (senderEmail.toLowerCase().startsWith('dat-csv-export@')) return 'DAT CSV Export';
    if (senderEmail.includes('dat-export')) return 'DAT Export';
    if (senderEmail.includes('oldcastle')) return 'Oldcastle Sync';
    if (senderEmail.includes('aljex')) return 'Aljex Sync';
    if (senderEmail.includes('email-import')) return 'Email Import';
    if (senderEmail.includes('adelphia')) return 'Adelphia Import';
    if (senderEmail.includes('vms')) return 'VMS Import';
    return 'Load Import';
  };

  const getBadgeVariant = (senderEmail: string, status: string) => {
    if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
    if (status === 'partial') return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Partial</Badge>;
    if (senderEmail.includes('daily-archive')) {
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Archive</Badge>;
    }
    if (senderEmail.toLowerCase().startsWith('dat-csv-export@')) {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">CSV Export</Badge>;
    }
    if (senderEmail.includes('dat-export')) {
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Export</Badge>;
    }
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Import</Badge>;
  };

  const renderBreakdown = (log: LogEntry) => {
    const b = log.raw_headers;
    if (!b) return null;

    // Manual DAT CSV download from Loads menu
    if (log.sender_email.toLowerCase().startsWith('dat-csv-export@')) {
      const name = typeof b.agent_name === 'string' && b.agent_name.trim() ? b.agent_name.trim() : 'Agent';
      const count = typeof b.count === 'number' ? b.count : (log.imported_count ?? 0);
      return (
        <div className="flex items-center gap-1.5 mt-1.5 text-sm text-green-700 dark:text-green-500">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">{name}</span> exported {count} load{count === 1 ? '' : 's'} to DAT CSV
          </span>
        </div>
      );
    }

    // Legacy DAT API export breakdown (hidden from list if sender is dat-export@; kept for safety)
    if (log.sender_email.includes('dat-export')) {
      const parts = [];
      if (b.posted !== undefined) parts.push(
        <span key="posted" className="flex items-center gap-0.5 text-green-600"><CheckCircle className="h-3 w-3" />{b.posted} posted</span>
      );
      if (b.already_on_dat !== undefined && b.already_on_dat > 0) parts.push(
        <span key="skip" className="flex items-center gap-0.5 text-muted-foreground"><RefreshCw className="h-3 w-3" />{b.already_on_dat} already on board</span>
      );
      if (b.failed !== undefined && b.failed > 0) parts.push(
        <span key="fail" className="flex items-center gap-0.5 text-amber-600"><XCircle className="h-3 w-3" />{b.failed} failed</span>
      );
      return parts.length > 0 ? <div className="flex items-center gap-3 flex-wrap mt-1.5">{parts}</div> : null;
    }

    // Import breakdown
    const parts = [];
    if (b.new !== undefined && b.new > 0) parts.push(
      <span key="new" className="flex items-center gap-0.5 text-green-600"><TrendingUp className="h-3 w-3" />{b.new} new</span>
    );
    if (b.updated !== undefined && b.updated > 0) parts.push(
      <span key="upd" className="flex items-center gap-0.5 text-blue-600"><RefreshCw className="h-3 w-3" />{b.updated} updated</span>
    );
    if (b.archived !== undefined && b.archived > 0) parts.push(
      <span key="arch" className="flex items-center gap-0.5 text-amber-600"><Archive className="h-3 w-3" />{b.archived} removed from sheet</span>
    );
    if (b.duplicates_removed !== undefined && b.duplicates_removed > 0) parts.push(
      <span key="dup" className="flex items-center gap-0.5 text-muted-foreground"><Trash2 className="h-3 w-3" />{b.duplicates_removed} dupes dropped</span>
    );
    return parts.length > 0 ? <div className="flex items-center gap-3 flex-wrap mt-1.5">{parts}</div> : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Load Activity Log
        </CardTitle>
        <CardDescription>
          Load imports and DAT CSV exports (legacy automated DAT API logs are hidden)
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
                      {resolveImportActivityLabel(log, runs, loadsWindow, getEventLabel)}
                    </span>
                    {getBadgeVariant(log.sender_email, log.status)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                    {log.imported_count !== null && log.imported_count > 0 && !log.sender_email.includes('dat-export') && !log.sender_email.toLowerCase().startsWith('dat-csv-export@') && (
                      <>
                        <span>•</span>
                        <span>{log.imported_count} loads total</span>
                      </>
                    )}
                  </div>
                  {renderBreakdown(log)}
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
