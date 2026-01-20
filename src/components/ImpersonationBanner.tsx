import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Eye, X, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ImpersonationBanner() {
  const { role } = useUserRole();
  const { isImpersonating, impersonatedAgencyName, clearImpersonation } = useImpersonation();
  const navigate = useNavigate();

  if (role !== 'super_admin' || !isImpersonating) {
    return null;
  }

  const handleExit = () => {
    clearImpersonation();
    navigate('/platform');
  };

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <Eye className="h-4 w-4" />
          <span className="text-sm font-medium">
            Viewing as: 
          </span>
          <span className="text-sm font-bold flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {impersonatedAgencyName}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-500/20"
          onClick={handleExit}
        >
          <X className="h-3 w-3" />
          Exit View
        </Button>
      </div>
    </div>
  );
}
