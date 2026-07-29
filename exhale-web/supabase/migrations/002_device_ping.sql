-- ============================================================
--  002_device_ping.sql
--  Adds a secure RPC function to allow devices to send a heartbeat.
-- ============================================================

-- This function allows a device to update its own 'updated_at' timestamp 
-- without needing full row-level update privileges. It acts as a heartbeat.
CREATE OR REPLACE FUNCTION public.ping_device(dev_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- runs with privileges of the creator
AS $$
BEGIN
  UPDATE public.device_config
  SET updated_at = NOW()
  WHERE device_id = dev_id;
END;
$$;

-- Allow anon and authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.ping_device(text) TO anon, authenticated;
