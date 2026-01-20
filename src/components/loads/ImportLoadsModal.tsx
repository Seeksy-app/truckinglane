import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useImpersonation } from "@/contexts/ImpersonationContext";

interface ImportLoadsModalProps {
  onImportComplete: () => void;
}

type ImportState = "idle" | "loading" | "success" | "error";

interface ImportResult {
  imported: number;
  archived: number;
  error?: string;
}

export function ImportLoadsModal({ onImportComplete }: ImportLoadsModalProps) {
  const navigate = useNavigate();
  const { impersonatedAgencyId } = useImpersonation();
  const [open, setOpen] = useState(false);
  const [templateType, setTemplateType] = useState<string>("aljex_flat");
  const [file, setFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const resetForm = () => {
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
      
      // Pass impersonated agency ID if super admin is impersonating
      if (impersonatedAgencyId) {
        formData.append("impersonated_agency_id", impersonatedAgencyId);
      }

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

      // Show success toast
      toast.success(`${result.imported} loads imported successfully`);
      setImportState("success");
      setImportResult({ imported: result.imported, archived: result.archived });
      onImportComplete();
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

  const handleViewDashboard = () => {
    setOpen(false);
    resetForm();
    navigate("/dashboard");
  };

  const handleImportAnother = () => {
    resetForm();
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  const renderCompletionState = () => (
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
        <Button variant="outline" className="flex-1" onClick={handleImportAnother}>
          Import Another File
        </Button>
        <Button className="flex-1" onClick={handleViewDashboard}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );

  const renderImportForm = () => (
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
        <Button variant="outline" onClick={() => setOpen(false)} disabled={importState === "loading"}>
          Cancel
        </Button>
        <Button onClick={handleImport} disabled={importState === "loading" || !file}>
          {importState === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Import
        </Button>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Import Loads
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Loads
          </DialogTitle>
        </DialogHeader>
        
        {importState === "success" || importState === "error" 
          ? renderCompletionState() 
          : renderImportForm()}
      </DialogContent>
    </Dialog>
  );
}