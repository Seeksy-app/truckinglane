import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type UserRole = 'agent' | 'agency_admin' | 'super_admin' | null;

interface UserRoleData {
  role: UserRole;
  agencyId: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useUserRole(): UserRoleData {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedForUser = useRef<string | null>(null);

  const fetchRole = useCallback(async () => {
    if (!user) {
      console.log('[useUserRole] No user, clearing role');
      setRole(null);
      setAgencyId(null);
      setLoading(false);
      fetchedForUser.current = null;
      return;
    }

    // Prevent duplicate fetches for same user
    if (fetchedForUser.current === user.id && role !== null) {
      console.log('[useUserRole] Already fetched for this user, skipping');
      return;
    }

    try {
      setLoading(true);
      console.log('[useUserRole] Fetching role for user:', user.id);
      
      const { data, error } = await supabase
        .from('agency_members')
        .select('role, agency_id')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('[useUserRole] Query result:', { data, error });

      if (error) {
        console.error('[useUserRole] Error fetching user role:', error);
        setRole(null);
        setAgencyId(null);
      } else if (data) {
        console.log('[useUserRole] Found role:', data.role, 'agency:', data.agency_id);
        setRole(data.role as UserRole);
        setAgencyId(data.agency_id);
        fetchedForUser.current = user.id;
      } else {
        console.log('[useUserRole] No membership found for user');
        setRole(null);
        setAgencyId(null);
      }
    } catch (err) {
      console.error('[useUserRole] Error fetching role:', err);
      setRole(null);
      setAgencyId(null);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    // Wait for auth to finish loading before fetching role
    if (authLoading) {
      console.log('[useUserRole] Auth still loading, waiting...');
      return;
    }
    
    fetchRole();
  }, [user?.id, authLoading, fetchRole]);

  // Reset when user changes
  useEffect(() => {
    if (!user) {
      fetchedForUser.current = null;
      setRole(null);
      setAgencyId(null);
    }
  }, [user]);

  const isLoading = authLoading || loading;
  
  return { role, agencyId, loading: isLoading, refetch: fetchRole };
}
