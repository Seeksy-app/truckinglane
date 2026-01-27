import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, Plus, X, Copy, RefreshCw, Loader2 } from 'lucide-react';

interface Agency {
  id: string;
  name: string;
  import_email_code?: string | null;
  allowed_sender_domains?: string[] | null;
}

interface AgencyEmailImportSettingsProps {
  agency: Agency;
  onUpdate?: () => void;
}

export function AgencyEmailImportSettings({ agency, onUpdate }: AgencyEmailImportSettingsProps) {
  const queryClient = useQueryClient();
  const [newDomain, setNewDomain] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  
  const importCode = agency.import_email_code;
  const allowedDomains = agency.allowed_sender_domains || [];
  
  // Generate a random import code
  const generateImportCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };
  
  const updateAgencyMutation = useMutation({
    mutationFn: async (updates: Partial<Agency>) => {
      const { error } = await supabase
        .from('agencies')
        .update(updates)
        .eq('id', agency.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super_admin_agencies'] });
      queryClient.invalidateQueries({ queryKey: ['agency_detail', agency.id] });
      onUpdate?.();
      toast.success('Settings updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });
  
  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    const code = generateImportCode();
    
    try {
      await updateAgencyMutation.mutateAsync({
        import_email_code: code,
      } as Partial<Agency>);
    } finally {
      setIsGeneratingCode(false);
    }
  };
  
  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    
    // Basic domain validation
    if (!domain.match(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i)) {
      toast.error('Please enter a valid domain (e.g., adelphia.com)');
      return;
    }
    
    if (allowedDomains.includes(domain)) {
      toast.error('Domain already added');
      return;
    }
    
    await updateAgencyMutation.mutateAsync({
      allowed_sender_domains: [...allowedDomains, domain],
    } as Partial<Agency>);
    
    setNewDomain('');
  };
  
  const handleRemoveDomain = async (domain: string) => {
    await updateAgencyMutation.mutateAsync({
      allowed_sender_domains: allowedDomains.filter(d => d !== domain),
    } as Partial<Agency>);
  };
  
  const copySubjectFormat = () => {
    const format = `ADELPHIA IMPORT - [${importCode || 'CODE'}]`;
    navigator.clipboard.writeText(format);
    toast.success('Subject format copied to clipboard');
  };
  
  const inboundEmail = 'loads@truckinglane.com'; // This should match your Resend inbound domain
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Email Import Settings
        </CardTitle>
        <CardDescription>
          Configure automatic load imports from email attachments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Import Code */}
        <div className="space-y-2">
          <Label>Agency Import Code</Label>
          <div className="flex items-center gap-2">
            {importCode ? (
              <>
                <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-sm">
                  {importCode}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateCode}
                  disabled={isGeneratingCode}
                  title="Generate new code"
                >
                  {isGeneratingCode ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleGenerateCode}
                disabled={isGeneratingCode}
                className="gap-2"
              >
                {isGeneratingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Generate Import Code
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This unique code identifies the agency in email subject lines
          </p>
        </div>
        
        {/* Email Instructions */}
        {importCode && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <h4 className="font-medium text-sm">How to send imports:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                Send email to: <code className="px-1 py-0.5 bg-background rounded">{inboundEmail}</code>
              </li>
              <li>
                <div className="inline-flex items-center gap-2">
                  Subject line: 
                  <code className="px-1 py-0.5 bg-background rounded">
                    ADELPHIA IMPORT - [{importCode}]
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={copySubjectFormat}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </li>
              <li>Attach the Adelphia XLSX spreadsheet</li>
            </ol>
          </div>
        )}
        
        {/* Allowed Sender Domains */}
        <div className="space-y-2">
          <Label>Allowed Sender Domains</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Only emails from these domains will be accepted. Leave empty to accept all domains.
          </p>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {allowedDomains.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                No restrictions (all domains accepted)
              </span>
            ) : (
              allowedDomains.map(domain => (
                <Badge key={domain} variant="secondary" className="gap-1 pr-1">
                  {domain}
                  <button
                    onClick={() => handleRemoveDomain(domain)}
                    className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                    disabled={updateAgencyMutation.isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          
          <div className="flex gap-2">
            <Input
              placeholder="e.g., adelphia.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
              className="flex-1"
            />
            <Button
              onClick={handleAddDomain}
              disabled={!newDomain.trim() || updateAgencyMutation.isPending}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
