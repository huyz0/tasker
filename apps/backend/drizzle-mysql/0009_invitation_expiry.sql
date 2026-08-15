-- Custom SQL migration file, put your code below! --

-- M03-T11. See the SQLite counterpart (0022_invitation_expiry.sql): nullable on
-- purpose, so invitations predating this migration stay valid rather than being
-- revoked wholesale the moment it runs.
ALTER TABLE `invitations` ADD COLUMN `expires_at` timestamp NULL;
