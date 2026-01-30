import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, ArrowRight, FileSpreadsheet, X, RotateCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });

  return { headers, rows };
}

function generateCSV(headers: string[], rows: Record<string, string>[]): string {
  const escapeField = (field: string): string => {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const headerLine = headers.map(escapeField).join(",");
  const dataLines = rows.map(row => 
    headers.map(header => escapeField(row[header] || "")).join(",")
  );

  return [headerLine, ...dataLines].join("\n");
}

export default function CsvConverter() {
  const navigate = useNavigate();
  const [sourceFile, setSourceFile] = useState<{ name: string; headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [targetFile, setTargetFile] = useState<{ name: string; headers: string[] } | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const handleSourceUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setSourceFile({ name: file.name, headers, rows });
      toast.success(`Loaded ${rows.length} rows from source file`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleTargetUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers } = parseCSV(text);
      setTargetFile({ name: file.name, headers });
      // Initialize mappings with empty values
      setMappings(headers.map(h => ({ sourceColumn: "", targetColumn: h })));
      toast.success(`Loaded target format with ${headers.length} columns`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const updateMapping = (targetColumn: string, sourceColumn: string) => {
    setMappings(prev => 
      prev.map(m => 
        m.targetColumn === targetColumn ? { ...m, sourceColumn } : m
      )
    );
  };

  const handleExport = () => {
    if (!sourceFile || !targetFile) {
      toast.error("Please upload both source and target files");
      return;
    }

    const convertedRows = sourceFile.rows.map(sourceRow => {
      const newRow: Record<string, string> = {};
      mappings.forEach(({ sourceColumn, targetColumn }) => {
        newRow[targetColumn] = sourceColumn ? (sourceRow[sourceColumn] || "") : "";
      });
      return newRow;
    });

    const csvContent = generateCSV(targetFile.headers, convertedRows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `converted_${sourceFile.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${convertedRows.length} rows`);
  };

  const resetAll = () => {
    setSourceFile(null);
    setTargetFile(null);
    setMappings([]);
  };

  const mappedCount = mappings.filter(m => m.sourceColumn).length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/dashboard')}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">CSV Format Converter</h1>
              <p className="text-muted-foreground">Map columns from your source file to the DAT format</p>
            </div>
          </div>
          {(sourceFile || targetFile) && (
            <Button variant="outline" onClick={resetAll} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {/* File Upload Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Source File */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                Source File (Your Current Format)
              </CardTitle>
              <CardDescription>Upload the CSV file you want to convert</CardDescription>
            </CardHeader>
            <CardContent>
              {sourceFile ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{sourceFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {sourceFile.headers.length} columns • {sourceFile.rows.length} rows
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSourceFile(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sourceFile.headers.slice(0, 8).map(h => (
                      <span key={h} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {h}
                      </span>
                    ))}
                    {sourceFile.headers.length > 8 && (
                      <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
                        +{sourceFile.headers.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload source CSV</span>
                  <input type="file" accept=".csv" onChange={handleSourceUpload} className="hidden" />
                </label>
              )}
            </CardContent>
          </Card>

          {/* Target File */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-500" />
                Target File (DAT Format)
              </CardTitle>
              <CardDescription>Upload a sample DAT file to use its column structure</CardDescription>
            </CardHeader>
            <CardContent>
              {targetFile ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{targetFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {targetFile.headers.length} columns
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setTargetFile(null); setMappings([]); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {targetFile.headers.slice(0, 8).map(h => (
                      <span key={h} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                        {h}
                      </span>
                    ))}
                    {targetFile.headers.length > 8 && (
                      <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
                        +{targetFile.headers.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload DAT format CSV</span>
                  <input type="file" accept=".csv" onChange={handleTargetUpload} className="hidden" />
                </label>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Column Mapping Section */}
        {sourceFile && targetFile && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Column Mapping</CardTitle>
                  <CardDescription>
                    Map each target column to a source column ({mappedCount}/{mappings.length} mapped)
                  </CardDescription>
                </div>
                <Button onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export Converted CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2">
                {mappings.map(({ targetColumn, sourceColumn }) => (
                  <div key={targetColumn} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <Select
                        value={sourceColumn || ""}
                        onValueChange={(value) => updateMapping(targetColumn, value)}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select source column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">-- Leave empty --</SelectItem>
                          {sourceFile.headers.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <div className="px-3 py-2 bg-green-100 text-green-800 rounded font-medium text-sm">
                        {targetColumn}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Section */}
        {sourceFile && targetFile && mappings.some(m => m.sourceColumn) && (
          <Card>
            <CardHeader>
              <CardTitle>Preview (First 5 Rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {targetFile.headers.map(h => (
                        <th key={h} className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sourceFile.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b">
                        {mappings.map(({ sourceColumn, targetColumn }) => (
                          <td key={targetColumn} className="p-2 whitespace-nowrap">
                            {sourceColumn ? (row[sourceColumn] || "-") : "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
