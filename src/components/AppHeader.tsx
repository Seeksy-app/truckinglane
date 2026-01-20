import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Settings, LayoutDashboard, Users, ChevronDown, BarChart3, Chrome, Sparkles, Search, Building2, ListTodo, Activity, Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, Bell, UserCircle, Globe, Eye, X, Zap } from 'lucide-react';
import { LogoIcon } from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type ImportState = "idle" | "loading" | "success" | "error";

interface ImportResult {
  imported: number;
  archived: number;
  error?: string;
}

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { role } = useUserRole();
  const { isImpersonating, impersonatedAgencyName, clearImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Import Loads state
  const [importOpen, setImportOpen] = useState(false);
  const [templateType, setTemplateType] = useState<string>("aljex_flat");
  const [file, setFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Fetch profile for avatar
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'agency_admin' || role === 'super_admin';
  const isOnAdminPage = location.pathname.startsWith('/admin');
  const isOnPlatformPage = location.pathname === '/platform';
  const isOnAnalyticsPage = location.pathname === '/analytics';
  const isOnLeadGenPage = ['/lead-discovery', '/accounts', '/prospecting', '/status'].some(p =>
    location.pathname === p || location.pathname.startsWith('/accounts/')
  );
  const isOnDashboard = location.pathname === '/dashboard';

  // Show agency-level nav when impersonating or when user is not super admin
  const showAgencyNav = !isSuperAdmin || isImpersonating;

  const handleExitImpersonation = () => {
    clearImpersonation();
    navigate('/platform');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const roleLabel = role === 'super_admin' 
    ? 'Platform Owner' 
    : role === 'agency_admin' 
    ? 'Admin' 
    : 'Agent';

  // Import Loads handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const resetImportForm = () => {
    setFile(null);
    setImportState("idle");
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setImportState("loading");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to import loads");
        setImportState("idle");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("template_type", templateType);

      const response = await fetch(
        `https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/import-loads`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setImportState("error");
        setImportResult({ imported: 0, archived: 0, error: result.error || "Import failed" });
        return;
      }

      toast.success(`${result.imported} loads imported successfully`);
      setImportState("success");
      setImportResult({ imported: result.imported, archived: result.archived });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    } catch (error) {
      console.error("Import error:", error);
      setImportState("error");
      setImportResult({ 
        imported: 0, 
        archived: 0, 
        error: error instanceof Error ? error.message : "Import failed" 
      });
    }
  };

  const handleImportOpenChange = (newOpen: boolean) => {
    setImportOpen(newOpen);
    if (!newOpen) {
      resetImportForm();
    }
  };

  return (
    <>
      {/* Impersonation Banner */}
      {isSuperAdmin && isImpersonating && (
        <div className="bg-amber-500/10 border-b border-amber-500/30">
          <div className="container mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Eye className="h-4 w-4" />
              <span className="text-sm font-medium">Viewing:</span>
              <span className="text-sm font-bold flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {impersonatedAgencyName}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-500/20"
              onClick={handleExitImpersonation}
            >
              <X className="h-3 w-3" />
              Exit View
            </Button>
          </div>
        </div>
      )}
      
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <LogoIcon className="w-9 h-9" />
              <span className="font-bold text-lg hidden sm:inline">Trucking Lane</span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {/* Super Admin: Platform Overview - always visible for super admin */}
              {isSuperAdmin && (
                <Button
                  variant={isOnPlatformPage ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => navigate('/platform')}
                  className="gap-2"
                >
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">Platform</span>
                </Button>
              )}

              {/* Agency-level nav - show when not super admin OR when impersonating */}
              {showAgencyNav && (
                <>
                  <Button
                    variant={isOnDashboard && !isOnAdminPage && !isOnAnalyticsPage ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                    className="gap-2"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Button>
                  <Button
                    variant={location.pathname === '/my-keywords' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => navigate('/my-keywords')}
                    className="gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">My Keywords</span>
                  </Button>
                  <Button
                    variant={isOnAnalyticsPage ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => navigate('/analytics')}
                    className="gap-2"
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Analytics</span>
                  </Button>
                  
                  {/* Import Loads */}
                  <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Upload className="h-4 w-4" />
                        <span className="hidden sm:inline">Import Loads</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileSpreadsheet className="h-5 w-5" />
                          Import Loads
                        </DialogTitle>
                      </DialogHeader>
                      
                      {importState === "success" || importState === "error" ? (
                        <div className="space-y-4 py-4">
                          {importState === "success" ? (
                            <div className="flex flex-col items-center text-center py-4">
                              <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                              <h3 className="text-lg font-semibold text-foreground">Import Successful</h3>
                              <p className="text-muted-foreground mt-1">
                                Imported {importResult?.imported} loads
                                {importResult?.archived ? ` (${importResult.archived} archived)` : ""}
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center text-center py-4">
                              <XCircle className="h-12 w-12 text-destructive mb-3" />
                              <h3 className="text-lg font-semibold text-foreground">Import Failed</h3>
                              <p className="text-muted-foreground mt-1">{importResult?.error}</p>
                            </div>
                          )}
                          <div className="flex gap-2 pt-4 border-t">
                            <Button variant="outline" className="flex-1" onClick={resetImportForm}>
                              Import Another File
                            </Button>
                            <Button className="flex-1" onClick={() => { setImportOpen(false); navigate('/dashboard'); }}>
                              Back to Dashboard
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Template</label>
                              <Select value={templateType} onValueChange={setTemplateType}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select template" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="aljex_flat">Aljex Flat (CSV)</SelectItem>
                                  <SelectItem value="adelphia_xlsx">Adelphia (XLSX)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {templateType === "adelphia_xlsx" ? "XLSX File" : "CSV File"}
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="file"
                                  accept={templateType === "adelphia_xlsx" ? ".xlsx,.xls" : ".csv"}
                                  onChange={handleFileChange}
                                  className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                                />
                              </div>
                              {file && (
                                <p className="text-sm text-muted-foreground">
                                  Selected: {file.name}
                                </p>
                              )}
                            </div>

                            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                              <p className="font-medium mb-1">Note:</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li>Active {templateType === "adelphia_xlsx" ? "Adelphia" : "Aljex"} loads will be archived</li>
                                <li>Booked loads are always retained</li>
                                <li>Loads from other templates remain untouched</li>
                              </ul>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importState === "loading"}>
                              Cancel
                            </Button>
                            <Button onClick={handleImport} disabled={importState === "loading" || !file}>
                              {importState === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Import
                            </Button>
                          </div>
                        </>
                      )}
                    </DialogContent>
                  </Dialog>

                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={isOnLeadGenPage ? 'secondary' : 'ghost'}
                          size="sm"
                          className="gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span className="hidden sm:inline">Lead Gen</span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => navigate('/lead-discovery')}>
                          <Search className="h-4 w-4 mr-2" />
                          Discover Leads
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate('/accounts')}>
                          <Building2 className="h-4 w-4 mr-2" />
                          Accounts
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate('/prospecting')}>
                          <ListTodo className="h-4 w-4 mr-2" />
                          Prospecting Queue
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate('/status')}>
                          <Activity className="h-4 w-4 mr-2" />
                          System Status
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {isAdmin && (
                    <Button
                      variant={isOnAdminPage ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => navigate('/admin/dashboard')}
                      className="gap-2"
                    >
                      <Users className="h-4 w-4" />
                      <span className="hidden sm:inline">Admin</span>
                    </Button>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || user?.email || "Profile"} />
                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                      {(profile?.full_name || user?.email || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium leading-none">{profile?.full_name || user?.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{roleLabel}</p>
                  </div>
                  <Badge variant="outline" className="sm:hidden">{roleLabel}</Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "Profile"} />
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                        {(profile?.full_name || user?.email || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{profile?.full_name || user?.email}</p>
                      <p className="text-xs text-muted-foreground font-normal">{roleLabel}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isSuperAdmin && (
                  <DropdownMenuItem onClick={() => navigate('/platform')}>
                    <Globe className="h-4 w-4 mr-2" />
                    Platform Overview
                  </DropdownMenuItem>
                )}
                {showAgencyNav && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/analytics')}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analytics
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate('/extension')}>
                  <Chrome className="h-4 w-4 mr-2" />
                  Chrome Extension
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserCircle className="h-4 w-4 mr-2" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings/notifications')}>
                  <Bell className="h-4 w-4 mr-2" />
                  Notification Settings
                </DropdownMenuItem>
                {showAgencyNav && isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
}
