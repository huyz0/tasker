-- Custom SQL migration file, put your code below! --

-- M13-T02. See the SQLite counterpart (0029_backfill_usernames.sql) for the
-- full reasoning: appending the whole (unique) `id` to the email's local
-- part makes the derived username provably unique, not merely unlikely to
-- collide.
UPDATE users
SET username = CONCAT(LOWER(SUBSTRING_INDEX(email, '@', 1)), '-', id)
WHERE username IS NULL;
