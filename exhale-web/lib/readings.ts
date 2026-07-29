import { getSupabase } from './supabase';

export type DateRange = 'today' | '7days' | '30days' | 'all';

export interface Reading {
  id:            string;
  user_id:       string;
  device_id:     string;
  co2:           number;
  temperature:   number;
  humidity:      number;
  acidity_index: number;
  estimated_ph:  number;
  created_at:    string; // ISO timestamp string
}

/**
 * Fetch readings for a user, newest first, with optional date range filter.
 */
export async function getReadings(
  userId:    string,
  dateRange: DateRange = 'all',
  maxCount:  number    = 500
): Promise<Reading[]> {
  let query = getSupabase()
    .from('readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(maxCount);

  if (dateRange !== 'all') {
    const from = new Date();
    if (dateRange === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (dateRange === '7days') {
      from.setDate(from.getDate() - 7);
    } else if (dateRange === '30days') {
      from.setDate(from.getDate() - 30);
    }
    query = query.gte('created_at', from.toISOString());
  }

  const { data, error } = await query;
  if (error) { console.error('getReadings error', error); return []; }
  return (data ?? []) as Reading[];
}

/**
 * Delete all readings for a given user.
 */
export async function deleteReadings(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('readings')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}
