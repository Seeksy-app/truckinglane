import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface ImpersonationContextType {
  impersonatedAgencyId: string | null;
  impersonatedAgencyName: string | null;
  setImpersonation: (agencyId: string | null, agencyName: string | null) => void;
  clearImpersonation: () => void;
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const STORAGE_KEY = 'impersonated_agency';

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [impersonatedAgencyId, setImpersonatedAgencyId] = useState<string | null>(null);
  const [impersonatedAgencyName, setImpersonatedAgencyName] = useState<string | null>(null);

  // Load from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setImpersonatedAgencyId(parsed.agencyId);
        setImpersonatedAgencyName(parsed.agencyName);
      } catch (e) {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const setImpersonation = (agencyId: string | null, agencyName: string | null) => {
    setImpersonatedAgencyId(agencyId);
    setImpersonatedAgencyName(agencyName);
    if (agencyId && agencyName) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ agencyId, agencyName }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  const clearImpersonation = () => {
    setImpersonatedAgencyId(null);
    setImpersonatedAgencyName(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedAgencyId,
        impersonatedAgencyName,
        setImpersonation,
        clearImpersonation,
        isImpersonating: !!impersonatedAgencyId,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
