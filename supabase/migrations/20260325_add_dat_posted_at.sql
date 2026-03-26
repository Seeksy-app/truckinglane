ALTER TABLE loads ADD COLUMN IF NOT EXISTS dat_posted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_loads_dat_posted_at ON loads(dat_posted_at) WHERE dat_posted_at IS NULL AND is_active = true;
