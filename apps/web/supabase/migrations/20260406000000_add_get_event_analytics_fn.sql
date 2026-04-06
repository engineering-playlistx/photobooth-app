-- V4-6.1: Add get_event_analytics RPC function for analytics dashboard
--
-- Returns aggregate stats for a given event:
--   total_visits     — SUM of visit_count across all guests
--   unique_guests    — COUNT of distinct guest rows
--   returning_guests — COUNT of guests with visit_count > 1
--   daily_trend      — JSON array of { date, visits } for the last 30 days
--
-- Called via Supabase JS: supabase.rpc('get_event_analytics', { p_event_id: '...' })
-- Verify after running: SELECT get_event_analytics('your_event_id');

CREATE OR REPLACE FUNCTION public.get_event_analytics(p_event_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_visits',     COALESCE(SUM(visit_count), 0),
    'unique_guests',    COUNT(*),
    'returning_guests', COUNT(*) FILTER (WHERE visit_count > 1),
    'daily_trend',      (
      SELECT json_agg(row_to_json(d) ORDER BY d.date)
      FROM (
        SELECT
          DATE(created_at AT TIME ZONE 'UTC')::text AS date,
          SUM(visit_count)::int AS visits
        FROM public.users
        WHERE event_id = p_event_id
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ) d
    )
  ) INTO result
  FROM public.users
  WHERE event_id = p_event_id;

  RETURN result;
END;
$$;
