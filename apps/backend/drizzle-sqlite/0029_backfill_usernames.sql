-- Custom SQL migration file, put your code below! --

-- M13-T02. Every pre-existing row has an email (it was NOT NULL until
-- 0028) but no username. Derive one instead of leaving it NULL, so the
-- backfill target in the exit criteria ("existing rows are backfilled with
-- a derived, de-duplicated username") is met by the migration itself, not
-- by a first-login side effect.
--
-- Uniqueness is provable rather than merely likely: `id` is already the
-- table's primary key, so appending the *entire* id to the email's local
-- part cannot collide, even if two accounts share the same local part
-- (e.g. two "jane@" addresses at different domains). The result is not
-- meant to be typed often — pre-M13 accounts keep authenticating through
-- their linked Google identity (0030) — it exists so `username` is never
-- NULL for a row that has always had a working login.
UPDATE users
SET username = lower(substr(email, 1, instr(email, '@') - 1)) || '-' || id
WHERE username IS NULL;
