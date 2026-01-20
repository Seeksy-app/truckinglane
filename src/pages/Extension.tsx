import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FolderOpen, Settings, CheckCircle, Chrome, Copy, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import JSZip from "jszip";

const ExtensionPage = () => {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    
    try {
      const zip = new JSZip();
      
      // Fetch all extension files
      const files = [
        { path: '/chrome-extension/manifest.json', name: 'manifest.json' },
        { path: '/chrome-extension/background.js', name: 'background.js' },
        { path: '/chrome-extension/popup.html', name: 'popup.html' },
        { path: '/chrome-extension/popup.js', name: 'popup.js' },
        { path: '/chrome-extension/icons/icon.svg', name: 'icons/icon.svg' },
        { path: '/chrome-extension/icons/icon16.png', name: 'icons/icon16.png' },
        { path: '/chrome-extension/icons/icon48.png', name: 'icons/icon48.png' },
        { path: '/chrome-extension/icons/icon128.png', name: 'icons/icon128.png' },
      ];
      
      for (const file of files) {
        const response = await fetch(file.path);
        if (response.ok) {
          // Check if it's a binary file (png)
          if (file.name.endsWith('.png')) {
            const blob = await response.blob();
            zip.file(file.name, blob);
          } else {
            const content = await response.text();
            zip.file(file.name, content);
          }
        }
      }
      
      // Generate the ZIP with explicit MIME type
      const blob = await zip.generateAsync({ 
        type: 'blob',
        mimeType: 'application/zip'
      });
      
      // Create download link with proper blob URL
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'trucking-lane-extension.zip';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after a delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success("Extension downloaded!", {
        description: "Extract the ZIP and load it in Chrome"
      });
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Download failed", {
        description: "Please try again"
      });
    } finally {
      setDownloading(false);
    }
  };

  const steps = [
    {
      number: 1,
      icon: Download,
      title: "Download the Extension",
      description: "Click the button below to download the extension files as a ZIP."
    },
    {
      number: 2,
      icon: FolderOpen,
      title: "Extract the ZIP",
      description: "Right-click the ZIP file → 'Extract All' (Windows) or double-click (Mac). This creates a folder with the extension files inside."
    },
    {
      number: 3,
      icon: Chrome,
      title: "Open Chrome Extensions",
      description: "Navigate to chrome://extensions in your browser or click Menu → More Tools → Extensions.",
      copyText: "chrome://extensions"
    },
    {
      number: 4,
      icon: Settings,
      title: "Enable Developer Mode",
      description: "Toggle the 'Developer mode' switch in the top-right corner of the Extensions page."
    },
    {
      number: 5,
      icon: CheckCircle,
      title: "Load the Extension",
      description: "Click 'Load unpacked' and select the FOLDER containing manifest.json (not the file itself). You should see icons folder, background.js, manifest.json, popup.html, and popup.js inside."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Chrome className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-semibold">Chrome Extension</h1>
                <p className="text-sm text-muted-foreground">AI Lead Notifications</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
            <Chrome className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Trucking Lane Chrome Extension</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Get instant desktop notifications when new AI leads come in. Never miss a hot lead again.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <Card className="text-center p-4">
            <div className="text-2xl mb-2">🔔</div>
            <p className="text-sm font-medium">Instant Alerts</p>
            <p className="text-xs text-muted-foreground">Desktop notifications</p>
          </Card>
          <Card className="text-center p-4">
            <div className="text-2xl mb-2">🔥</div>
            <p className="text-sm font-medium">High Intent</p>
            <p className="text-xs text-muted-foreground">Priority notifications</p>
          </Card>
          <Card className="text-center p-4">
            <div className="text-2xl mb-2">📊</div>
            <p className="text-sm font-medium">Badge Count</p>
            <p className="text-xs text-muted-foreground">See active leads</p>
          </Card>
        </div>

        {/* Installation Steps */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Installation Steps</CardTitle>
            <CardDescription>Follow these steps to install the extension in Developer Mode</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                  {step.number}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <step.icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {step.copyText && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 gap-2 font-mono text-xs"
                      onClick={() => copyToClipboard(step.copyText!)}
                    >
                      {step.copyText}
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Download CTA */}
        <Card className="bg-card border-primary/20">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold mb-1">Ready to Install?</h3>
              <p className="text-sm text-muted-foreground">Download the extension package and follow the steps above.</p>
            </div>
            <Button onClick={handleDownload} className="gap-2" disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Creating ZIP..." : "Download Extension"}
            </Button>
          </CardContent>
        </Card>

        {/* Note */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          After installing, click the extension icon and sign in with your Trucking Lane account to start receiving notifications.
        </p>
      </main>
    </div>
  );
};

export default ExtensionPage;
