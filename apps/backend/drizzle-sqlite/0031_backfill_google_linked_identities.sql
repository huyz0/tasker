-- Custom SQL migration file, put your code below! --

-- M13-T04. Before this milestone, `users.id` *was* the caller's Google `sub`.
-- ADR-0012 §3: that value does not move — every other table's `user_id`
-- foreign key stays valid with no changes of its own — so the only thing
-- this migration does is give every existing user a `linked_identities` row
-- that says explicitly what was previously implicit: this user authenticates
-- via Google, using this id as their provider identity.
--
-- Idempotent (`WHERE ... NOT IN`) so re-running it after a user has already
-- been backfilled, or after 0030 landed on a database with fixture data, is
-- a no-op rather than a duplicate-row/unique-constraint error.
INSERT INTO linked_identities (id, user_id, provider, provider_user_id, linked_at)
SELECT 'li-' || lower(hex(randomblob(16))), id, 'google', id, created_at
FROM users
WHERE id NOT IN (SELECT user_id FROM linked_identities WHERE provider = 'google');
