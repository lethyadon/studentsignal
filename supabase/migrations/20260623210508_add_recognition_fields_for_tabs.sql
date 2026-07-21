-- Add is_cleared (hidden from active queue, still visible in completed tab/timeline)
-- and is_dismissed (explicitly dismissed by staff)
ALTER TABLE success_recognitions
  ADD COLUMN IF NOT EXISTS is_cleared BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN DEFAULT FALSE;

