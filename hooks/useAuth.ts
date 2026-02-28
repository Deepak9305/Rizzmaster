
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { UserProfile, SavedItem } from '../types';

const DAILY_CREDITS = 5;

export const useAuth = (showToast: (msg: string, type: 'success' | 'error' | 'info') => void) => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const loadUserData = useCallback(async (userId: string, email?: string) => {
    if (!supabase || userId === 'guest') {
        const storedProfile = localStorage.getItem('guest_profile');
        const storedItems = localStorage.getItem('guest_saved_items');
        
        if (storedProfile) {
            setProfile(JSON.parse(storedProfile));
        } else {
            const newProfile: UserProfile = { 
              id: 'guest', 
              email: 'guest@rizzmaster.ai', 
              credits: DAILY_CREDITS, 
              is_premium: false, 
              last_daily_reset: new Date().toISOString().split('T')[0] 
            };
            setProfile(newProfile);
            localStorage.setItem('guest_profile', JSON.stringify(newProfile));
        }
        setSavedItems(storedItems ? JSON.parse(storedItems) : []);
        return;
    }

    try {
        const profilePromise = supabase.from('profiles').select('*').eq('id', userId).single();
        const savedPromise = supabase.from('saved_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });

        const [profileResult, savedResult] = await Promise.all([profilePromise, savedPromise]);

        let profileData = profileResult.data;
        const savedData = savedResult.data;

        if (savedData) {
            setSavedItems(savedData as SavedItem[]);
        }

        if (profileResult.error?.code === 'PGRST116') {
            const { data: newProfile } = await supabase.from('profiles').insert([{ 
                id: userId, 
                email: email, 
                credits: DAILY_CREDITS, 
                is_premium: false,
                last_daily_reset: new Date().toISOString().split('T')[0]
            }]).select().single();
            if (newProfile) profileData = newProfile;
        } else if (profileData) {
            const today = new Date().toISOString().split('T')[0];
            if (profileData.last_daily_reset !== today) {
                const { data: updated } = await supabase.from('profiles').update({ credits: DAILY_CREDITS, last_daily_reset: today }).eq('id', userId).select().single();
                if (updated) profileData = updated;
            }
        }

        if (profileData) setProfile(profileData as UserProfile);
    } catch (e) {
        console.error("Error loading user data", e);
    }
  }, []);

  const updateCredits = useCallback(async (newAmount: number) => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    const updatedProfile = { ...currentProfile, credits: newAmount };
    setProfile(updatedProfile); 
    
    try {
        if (supabase && currentProfile.id !== 'guest') {
            await supabase.from('profiles').update({ credits: newAmount }).eq('id', currentProfile.id);
        } else {
            localStorage.setItem('guest_profile', JSON.stringify(updatedProfile));
        }
    } catch (err) {
        console.error("Critical error updating credits:", err);
    }
  }, []);

  return {
    session,
    setSession,
    profile,
    setProfile,
    isAuthReady,
    setIsAuthReady,
    savedItems,
    setSavedItems,
    profileRef,
    loadUserData,
    updateCredits
  };
};
