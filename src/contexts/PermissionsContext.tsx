
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth } from '../lib/firebase';
import { UserProfile, Permissions } from '../types';
import { DataService } from '../services/DataService';
import { CacheManager } from '../services/CacheManager';

const EMPTY_PERMISSIONS: Permissions = {
  canReadAllLeads: false,
  canWriteAllLeads: false,
  canDelete: false,
  canAccessSettings: false,
  canManageUsers: false
};

interface PermissionsContextType {
  permissions: Permissions;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

const isDeepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (typeof a[key] === 'object' && typeof b[key] === 'object') {
      if (!isDeepEqual(a[key], b[key])) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissions, setPermissions] = useState<Permissions>(EMPTY_PERMISSIONS);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const lastUpdateRef = useRef<UserProfile | null>(null);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }
      
      if (!user) {
        setPermissions(EMPTY_PERMISSIONS);
        setUserProfile(null);
        lastUpdateRef.current = null;
        setLoading(false);
        return;
      }

      setLoading(true);

      const handleUserUpdate = (userData: any) => {
        if (!userData) {
          setLoading(false);
          return;
        }

        const profile = {
          ...userData,
          organizationId: userData.organizationId || 'default'
        } as UserProfile;

        // Auto-repair missing fields if needed (only if any are strictly falsy/missing)
        const needsRepair = !userData.organizationId || !userData.userType || !userData.status || !userData.role || !userData.permissions || (!userData.profileId && !userData.accessProfileId);
        if (needsRepair) {
           console.log("[USER_PROFILE] Deep Repair triggered:", { uid: user.uid });
           
           // Determine default permissions if missing
           const defaultPerms = userData.permissions || (userData.role === 'admin' ? {
             canReadAllLeads: true,
             canWriteAllLeads: true,
             canDelete: true,
             canAccessSettings: true,
             canManageUsers: true
           } : EMPTY_PERMISSIONS);

           DataService.update('users', user.uid, {
            organizationId: userData.organizationId || 'default',
            userType: userData.userType || 'HUMAN',
            status: userData.status || 'active',
            role: userData.role || 'atendente',
            permissions: defaultPerms,
            accessProfileId: userData.accessProfileId || 'default_atendente',
            updatedAt: new Date().toISOString()
          }).catch(err => console.error("FAILED_TO_REPAIR_USER", err));
        }

        if (!isDeepEqual(lastUpdateRef.current, profile)) {
          console.log("[USER_SNAPSHOT_SKIPPED] Detected actual changes for:", profile.uid);
          console.log("FIRESTORE_USER_LOADED", {
            uid: profile.uid,
            role: profile.role,
            organizationId: profile.organizationId
          });
          
          lastUpdateRef.current = profile;
          setUserProfile(profile);
          setPermissions(profile.permissions || EMPTY_PERMISSIONS);
          DataService.setCurrentUser(profile);
        } else {
          // If no change, just log once or skip
          if (loadingRef.current) {
             console.log("[USER_SNAPSHOT_SKIPPED] No structural changes detected.");
          }
        }
        
        setLoading(false);
      };

      // Cache first
      const cached = CacheManager.get(`user:${user.uid}`);
      if (cached) handleUserUpdate(cached);

      // Subscribe LIVE
      unsubscribeUser = DataService.subscribe('user', user.uid, (data) => {
        handleUserUpdate(data);
      }, true);
    });

    return () => {
      if (unsubscribeUser) unsubscribeUser();
      unsubscribeAuth();
    };
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, userProfile, loading, error }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
