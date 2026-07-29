import { createBrowserClient } from '@supabase/ssr';

// Lazy singleton — only instantiated in the browser on first call.
// This prevents Next.js build from crashing when env vars are empty.
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id:         string;
          name:       string;
          age:        number | null;
          gender:     'Male' | 'Female' | 'Other' | null;
          birthday:   string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      readings: {
        Row: {
          id:            string;
          user_id:       string;
          device_id:     string;
          co2:           number | null;
          temperature:   number | null;
          humidity:      number | null;
          acidity_index: number | null;
          estimated_ph:  number | null;
          created_at:    string;
        };
      };
      device_config: {
        Row: {
          id:               number;
          active_user_id:   string | null;
          active_user_name: string | null;
          device_id:        string;
          updated_at:       string;
        };
        Update: Partial<Pick<
          Database['public']['Tables']['device_config']['Row'],
          'active_user_id' | 'active_user_name' | 'device_id' | 'updated_at'
        >>;
      };
    };
  };
};
