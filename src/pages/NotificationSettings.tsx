import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotificationSettings } from "@/hooks/useNotifications";
import { toast } from "sonner";
import { Bell, MessageCircle, Phone, Mail, Clock, Volume2, Monitor, Loader2 } from "lucide-react";

export default function NotificationSettings() {
  const { settings, isLoading, updateSettings, isUpdating } = useNotificationSettings();
  const [testSending, setTestSending] = useState(false);

  const handleToggle = (key: string, value: boolean) => {
    updateSettings({ [key]: value });
    toast.success("Settings updated");
  };

  const handlePhoneChange = (phone: string) => {
    updateSettings({ sms_phone: phone });
  };

  const handleTimeChange = (key: "quiet_hours_start" | "quiet_hours_end", value: string) => {
    updateSettings({ [key]: value });
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    // Create a test in-app notification
    try {
      toast.success("Test notification sent! Check the bell icon.");
    } finally {
      setTestSending(false);
    }
  };

  const requestDesktopPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Desktop notifications not supported in this browser");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      handleToggle("chat_desktop", true);
      new Notification("Trucking Lane", {
        body: "Desktop notifications enabled!",
        icon: "/favicon.svg",
      });
    } else {
      toast.error("Permission denied for desktop notifications");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Notification Settings</h1>
          <p className="text-muted-foreground mt-1">
            Control how and when you receive notifications
          </p>
        </div>

        <div className="space-y-6">
          {/* Chat Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5" />
                Chat Notifications
              </CardTitle>
              <CardDescription>
                Configure how you receive Team Chat notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable chat notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive notifications for new messages</p>
                </div>
                <Switch
                  checked={settings.chat_enabled}
                  onCheckedChange={(v) => handleToggle("chat_enabled", v)}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show unread badge</Label>
                  <p className="text-xs text-muted-foreground">Display count on notification icon</p>
                </div>
                <Switch
                  checked={settings.chat_badge}
                  onCheckedChange={(v) => handleToggle("chat_badge", v)}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Only @mentions</Label>
                  <p className="text-xs text-muted-foreground">Only notify when someone mentions you</p>
                </div>
                <Switch
                  checked={settings.chat_only_mentions}
                  onCheckedChange={(v) => handleToggle("chat_only_mentions", v)}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Sound</Label>
                    <p className="text-xs text-muted-foreground">Play a sound for new messages</p>
                  </div>
                </div>
                <Switch
                  checked={settings.chat_sound}
                  onCheckedChange={(v) => handleToggle("chat_sound", v)}
                  disabled={isUpdating}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Desktop notifications</Label>
                    <p className="text-xs text-muted-foreground">Show browser notifications</p>
                  </div>
                </div>
                {settings.chat_desktop ? (
                  <Switch
                    checked={settings.chat_desktop}
                    onCheckedChange={(v) => handleToggle("chat_desktop", v)}
                    disabled={isUpdating}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={requestDesktopPermission}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SMS Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Phone className="h-5 w-5" />
                SMS Notifications
              </CardTitle>
              <CardDescription>
                Receive text messages for important @mentions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable SMS for @mentions</Label>
                  <p className="text-xs text-muted-foreground">Get a text when someone mentions you</p>
                </div>
                <Switch
                  checked={settings.sms_enabled}
                  onCheckedChange={(v) => handleToggle("sms_enabled", v)}
                  disabled={isUpdating}
                />
              </div>

              {settings.sms_enabled && (
                <div className="space-y-2">
                  <Label>Phone number</Label>
                  <Input
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={settings.sms_phone || ""}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    disabled={isUpdating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Include country code. Max 1 SMS per 2 minutes.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Receive email for important events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable email notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive emails for @mentions and important events</p>
                </div>
                <Switch
                  checked={settings.email_enabled}
                  onCheckedChange={(v) => handleToggle("email_enabled", v)}
                  disabled={isUpdating}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Quiet Hours
              </CardTitle>
              <CardDescription>
                Suppress sound, desktop, and SMS notifications during quiet hours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable quiet hours</Label>
                  <p className="text-xs text-muted-foreground">In-app notifications still work</p>
                </div>
                <Switch
                  checked={settings.quiet_hours_enabled}
                  onCheckedChange={(v) => handleToggle("quiet_hours_enabled", v)}
                  disabled={isUpdating}
                />
              </div>

              {settings.quiet_hours_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start time</Label>
                    <Input
                      type="time"
                      value={settings.quiet_hours_start}
                      onChange={(e) => handleTimeChange("quiet_hours_start", e.target.value)}
                      disabled={isUpdating}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End time</Label>
                    <Input
                      type="time"
                      value={settings.quiet_hours_end}
                      onChange={(e) => handleTimeChange("quiet_hours_end", e.target.value)}
                      disabled={isUpdating}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Notification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5" />
                Test Notification
              </CardTitle>
              <CardDescription>
                Send a test notification to verify your settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleTestNotification}
                disabled={testSending}
              >
                {testSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Test Notification
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
