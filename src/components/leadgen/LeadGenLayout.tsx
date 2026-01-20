import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Building2, ListTodo, Activity } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface LeadGenLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'Discover Leads', path: '/lead-discovery', icon: Search },
  { label: 'Accounts', path: '/accounts', icon: Building2 },
  { label: 'Prospecting Queue', path: '/prospecting', icon: ListTodo },
  { label: 'System Status', path: '/status', icon: Activity },
];

export function LeadGenLayout({ children }: LeadGenLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isActive = (path: string) => {
    if (path === '/accounts') {
      return location.pathname === '/accounts' || location.pathname.startsWith('/accounts/');
    }
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card min-h-[calc(100vh-57px)]">
          <nav className="flex flex-col gap-1 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">
              Lead Gen
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              
              return (
                <Button
                  key={item.path}
                  variant={active ? 'secondary' : 'ghost'}
                  className={cn(
                    'justify-start gap-3 h-10',
                    active && 'bg-secondary font-medium'
                  )}
                  onClick={() => navigate(item.path)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-[calc(100vh-57px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
