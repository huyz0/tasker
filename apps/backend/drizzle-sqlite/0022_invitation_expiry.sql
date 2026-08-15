-- Custom SQL migration file, put your code below! --

-- M03-T11. An invitation with no expiry is a standing key to the organization:
-- an address invited once could be redeemed at any point afterwards, including
-- long after whoever sent it had left.
--
-- Nullable on purpose. Existing rows have no expiry and stay valid; treating a
-- NULL as "expired at the epoch" would silently revoke every outstanding
-- invitation the moment this ran, which is a support incident rather than a
-- migration. New rows get an expiry from the handler.
ALTER TABLE `invitations` ADD COLUMN `expires_at` integer;
