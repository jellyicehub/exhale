import { getSupabase } from './supabase';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

export type { User, Session, AuthChangeEvent };

export interface UserProfile {
  name:     string;
  age:      number;
  gender:   'Male' | 'Female' | 'Other';
  birthday: string; // ISO date e.g. "1990-04-15"
}

/**
 * Sign up a new user:
 *   1. Creates a Supabase Auth account
 *   2. Inserts a profile row into public.users
 */
export async function signUp(
  email:    string,
  password: string,
  profile:  UserProfile
): Promise<User> {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Sign up succeeded but no user returned.');

  const { error: profileError } = await supabase.from('users').insert({
    id:       data.user.id,
    name:     profile.name,
    age:      profile.age,
    gender:   profile.gender,
    birthday: profile.birthday,
  });
  if (profileError) throw profileError;

  return data.user;
}

/**
 * Sign in with email + password.
 * Also registers this user as the active device user in device_config.
 */
export async function signIn(email: string, password: string): Promise<User> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Register as active device user so ESP32 uploads to this account
  await supabase
    .from('device_config')
    .update({ active_user_id: data.user.id, active_user_name: data.user.email })
    .eq('id', 1);

  return data.user;
}

/**
 * Sign out the current user.
 * Also clears the active device user so the ESP32 stops uploading.
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  // Clear device active user first (best-effort)
  try {
    await supabase
      .from('device_config')
      .update({ active_user_id: null, active_user_name: null })
      .eq('id', 1);
  } catch { /* ignore */ }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Update the current user's password.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthChange(
  callback: (user: User | null, session: Session | null) => void
): () => void {
  const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
    (event: AuthChangeEvent, session: Session | null) => callback(session?.user ?? null, session)
  );
  return () => subscription.unsubscribe();
}

/**
 * Get the currently signed-in user (async, server-safe).
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await getSupabase().auth.getUser();
  return user;
}
