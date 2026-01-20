import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Shield, 
  Loader2, 
  Plus, 
  X, 
  Eye, 
  Ban,
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle
} from "lucide-react";

interface TrustPageSettings {
  id: string;
  is_enabled: boolean;
  allowed_domains: string[] | null;
  allowed_emails: string[] | null;
  updated_at: string;
}

interface TrustPageSession {
  id: string;
  email: string;
  verified_at: string | null;
  session_expires_at: string | null;
  revoked_at: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AccessLog {
  id: string;
  email: string;
  action: string;
  ip_address: string | null;
  created_at: string;
}

export function TrustPageAdmin() {
  const [settings, setSettings] = useState<TrustPageSettings | null>(null);
  const [sessions, setSessions] = useState<TrustPageSession[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "sessions" | "logs">("settings");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from("trust_page_settings")
        .select("*")
        .single();

      if (settingsError) {
        console.error("Error fetching settings:", settingsError);
      } else {
        setSettings(settingsData);
      }

      // Fetch sessions
      const { data: sessionsData } = await supabase
        .from("trust_page_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      setSessions(sessionsData || []);

      // Fetch logs
      const { data: logsData } = await supabase
        .from("trust_page_access_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      setLogs(logsData || []);
    } catch (err) {
      console.error("Error fetching trust page data:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trust_page_settings")
        .update({ is_enabled: !settings.is_enabled })
        .eq("id", settings.id);

      if (error) throw error;

      setSettings({ ...settings, is_enabled: !settings.is_enabled });
      toast.success(settings.is_enabled ? "Page disabled" : "Page enabled");
    } catch (err) {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const addEmail = async () => {
    if (!settings || !newEmail.trim()) return;

    const emails = [...(settings.allowed_emails || []), newEmail.trim()];
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trust_page_settings")
        .update({ allowed_emails: emails })
        .eq("id", settings.id);

      if (error) throw error;

      setSettings({ ...settings, allowed_emails: emails });
      setNewEmail("");
      toast.success("Email added");
    } catch (err) {
      toast.error("Failed to add email");
    } finally {
      setSaving(false);
    }
  };

  const removeEmail = async (email: string) => {
    if (!settings) return;

    const emails = (settings.allowed_emails || []).filter((e) => e !== email);
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trust_page_settings")
        .update({ allowed_emails: emails.length > 0 ? emails : null })
        .eq("id", settings.id);

      if (error) throw error;

      setSettings({ ...settings, allowed_emails: emails.length > 0 ? emails : null });
      toast.success("Email removed");
    } catch (err) {
      toast.error("Failed to remove email");
    } finally {
      setSaving(false);
    }
  };

  const addDomain = async () => {
    if (!settings || !newDomain.trim()) return;

    const domains = [...(settings.allowed_domains || []), newDomain.trim()];
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trust_page_settings")
        .update({ allowed_domains: domains })
        .eq("id", settings.id);

      if (error) throw error;

      setSettings({ ...settings, allowed_domains: domains });
      setNewDomain("");
      toast.success("Domain added");
    } catch (err) {
      toast.error("Failed to add domain");
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (domain: string) => {
    if (!settings) return;

    const domains = (settings.allowed_domains || []).filter((d) => d !== domain);
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trust_page_settings")
        .update({ allowed_domains: domains.length > 0 ? domains : null })
        .eq("id", settings.id);

      if (error) throw error;

      setSettings({ ...settings, allowed_domains: domains.length > 0 ? domains : null });
      toast.success("Domain removed");
    } catch (err) {
      toast.error("Failed to remove domain");
    } finally {
      setSaving(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trust_page_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (error) throw error;

      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, revoked_at: new Date().toISOString() } : s
      ));
      toast.success("Session revoked");
    } catch (err) {
      toast.error("Failed to revoke session");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const getSessionStatus = (session: TrustPageSession) => {
    if (session.revoked_at) return { label: "Revoked", variant: "destructive" as const };
    if (!session.verified_at) return { label: "Pending", variant: "secondary" as const };
    if (session.session_expires_at && new Date(session.session_expires_at) < new Date()) {
      return { label: "Expired", variant: "outline" as const };
    }
    return { label: "Active", variant: "default" as const };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Trust Page Access Control
            </CardTitle>
            <CardDescription>
              Manage who can access the /trust marketing page
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-border pb-2">
          {[
            { id: "settings", label: "Settings" },
            { id: "sessions", label: "Sessions" },
            { id: "logs", label: "Access Logs" },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
            >
              {tab.label}
            </Button>
          ))}
          <a
            href="/trust"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Page
            </Button>
          </a>
        </div>

        {activeTab === "settings" && settings && (
          <div className="space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-base font-medium">Page Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  When disabled, visitors will see an error message
                </p>
              </div>
              <Switch
                checked={settings.is_enabled}
                onCheckedChange={toggleEnabled}
                disabled={saving}
              />
            </div>

            {/* Allowed Emails */}
            <div className="space-y-3">
              <Label>Allowed Emails</Label>
              <p className="text-sm text-muted-foreground">
                {settings.allowed_emails?.length || settings.allowed_domains?.length
                  ? "Only these emails can access the page"
                  : "No restrictions — anyone can request access"}
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addEmail} disabled={saving || !newEmail.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              {settings.allowed_emails && settings.allowed_emails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.allowed_emails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1 pr-1">
                      {email}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-destructive/20"
                        onClick={() => removeEmail(email)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Allowed Domains */}
            <div className="space-y-3">
              <Label>Allowed Domains</Label>
              <p className="text-sm text-muted-foreground">
                Anyone with an email from these domains can access
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addDomain} disabled={saving || !newDomain.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              {settings.allowed_domains && settings.allowed_domains.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.allowed_domains.map((domain) => (
                    <Badge key={domain} variant="secondary" className="gap-1 pr-1">
                      @{domain}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-destructive/20"
                        onClick={() => removeDomain(domain)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No sessions yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => {
                    const status = getSessionStatus(session);
                    return (
                      <TableRow key={session.id}>
                        <TableCell className="font-medium">{session.email}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {session.ip_address || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(session.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {!session.revoked_at && session.verified_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeSession(session.id)}
                              disabled={saving}
                              className="text-destructive hover:text-destructive"
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-4">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No access logs yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{log.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.action === "verified"
                              ? "default"
                              : log.action.includes("invalid") || log.action.includes("expired")
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {log.action === "verified" && <CheckCircle className="h-3 w-3 mr-1" />}
                          {(log.action.includes("invalid") || log.action.includes("expired")) && (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.ip_address || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}