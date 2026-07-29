import { getSupabase } from './supabase';
import type { UserProfile } from './auth';

export interface UserDoc extends UserProfile {
  id:         string;
  created_at: string;
}

export interface DeviceConfig {
  active_user_id:   string | null;
  active_user_name: string | null;
  device_id:        string;
}

/**
 * Fetch the profile for a given user ID.
 */
export async function getUser(userId: string): Promise<UserDoc | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error('getUser error', error); return null; }
  return data as UserDoc;
}

/**
 * Update editable fields of the current user's profile.
 */
export async function updateUser(
  userId: string,
  data:   Partial<UserProfile>
): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .update(data)
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Set the active user on the device_config row.
 * The ESP32 reads this to know who to tag readings with.
 */
export async function setActiveUser(userId: string, name: string): Promise<void> {
  const { error } = await getSupabase()
    .from('device_config')
    .update({
      active_user_id:   userId,
      active_user_name: name,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) throw error;
}

/**
 * Get the current device config (which user is active on the device).
 */
export async function getActiveUser(): Promise<DeviceConfig | null> {
  const { data, error } = await getSupabase()
    .from('device_config')
    .select('active_user_id, active_user_name, device_id')
    .eq('id', 1)
    .single();
  if (error) { console.error('getActiveUser error', error); return null; }
  return data as DeviceConfig;
}

/**
 * Fetch all user profiles (used by ActiveUserPicker to list all users).
 */
export async function getAllUsers(): Promise<UserDoc[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .order('name');
  if (error) { console.error('getAllUsers error', error); return []; }
  return (data ?? []) as UserDoc[];
}
