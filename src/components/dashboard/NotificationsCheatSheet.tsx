import { Bell, Chrome, Settings, CheckCircle2, Volume2, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const NotificationsCheatSheet = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Bell className="h-4 w-4" />
          Enable Notifications
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notifications Cheat Sheet
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-2">
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">1</span>
            </div>
            <div className="flex-1">
              <h4 className="font-medium flex items-center gap-2">
                <Chrome className="h-4 w-4" />
                Allow Browser Permissions
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Click the lock icon in your browser's address bar → Site settings → Allow Notifications
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">2</span>
            </div>
            <div className="flex-1">
              <h4 className="font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Enable in App Settings
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Go to Profile → Notification Settings → Turn on "Desktop Notifications"
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">3</span>
            </div>
            <div className="flex-1">
              <h4 className="font-medium flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Enable Sound (Optional)
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Toggle "Notification Sound" to hear an alert for new leads
              </p>
            </div>
          </div>

          {/* What you'll get */}
          <div className="bg-muted/50 rounded-lg p-3 mt-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              What You'll Get
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Instant alerts for new leads</li>
              <li>• High-intent leads stay visible until dismissed</li>
              <li>• Click notification to jump to lead details</li>
            </ul>
          </div>

          {/* Mobile tip */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
            <Smartphone className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Mobile:</strong> Add this site to your home screen for the best notification experience.
            </p>
          </div>

          {/* Chrome Extension badge */}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Want background alerts?</span>
            <Badge variant="secondary" className="text-xs">
              Chrome Extension Available
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
