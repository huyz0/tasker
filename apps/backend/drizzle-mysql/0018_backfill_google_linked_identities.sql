-- Custom SQL migration file, put your code below! --

-- M13-T04. See the SQLite counterpart for the full reasoning.
INSERT INTO linked_identities (id, user_id, provider, provider_user_id, linked_at)
SELECT CONCAT('li-', UUID()), id, 'google', id, created_at
FROM users
WHERE id NOT IN (SELECT user_id FROM linked_identities WHERE provider = 'google');
