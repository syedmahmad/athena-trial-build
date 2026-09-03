-- Add detailed_hint column for gradient scaffolding (nudge → walk-through → reveal)
ALTER TABLE practice_problems ADD COLUMN IF NOT EXISTS detailed_hint text;
ALTER TABLE sat_problems ADD COLUMN IF NOT EXISTS detailed_hint text;
