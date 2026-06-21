BEGIN;

-- Drop the legacy column that is no longer used and causes 23502 violations
ALTER TABLE public.appointments 
DROP COLUMN IF EXISTS therapist_id_old_users_ref;

COMMIT;
