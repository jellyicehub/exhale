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
  // ABG and calibration fields
  etco2_mmhg?:       number;
  etco2_dry_mmhg?:   number;
  paco2_est_mmhg?:   number;
  ph_est?:           number;
  hco3_est_meql?:    number;
  base_excess_meql?: number;
  po2_est_mmhg?:     number;
  o2sat_est_pct?:    number;
  spo2_input_pct?:   number;
  ai_processed?:     boolean;
  calibration_meta?: any;
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

/**
 * Returns the classification label for a given Acidity Index (AI).
 */
export function getAcidityClassification(ai: number): string {
  if (ai <= 20) return 'Very Low Acidity';
  if (ai <= 40) return 'Low Acidity';
  if (ai <= 55) return 'Normal/Baseline';
  if (ai <= 70) return 'Slightly Elevated';
  if (ai <= 85) return 'Elevated';
  return 'Highly Elevated';
}

/**
 * Returns a CSS class name mapped from the AI score.
 */
export function getAcidityBadgeClass(ai: number): string {
  if (ai <= 20) return 'ai-very-low';
  if (ai <= 40) return 'ai-low';
  if (ai <= 55) return 'ai-normal';
  if (ai <= 70) return 'ai-slight-high';
  if (ai <= 85) return 'ai-elevated';
  return 'ai-high';
}
