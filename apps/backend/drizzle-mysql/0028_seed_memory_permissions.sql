-- Custom SQL migration file, put your code below! --

-- M21-T03 (ADR-0014). See the SQLite counterpart for the full reasoning:
-- adds memory:{read,write,admin}, then re-runs the same four wildcard
-- role_permissions SELECTs from 0021_seed_system_roles_and_migrate_grants.sql
-- so INSERT IGNORE lands only the three new keys against each system role.

INSERT IGNORE INTO permissions (`key`, description) VALUES
  ('memory:read', 'Search and view shared beliefs'),
  ('memory:write', 'Record, update, supersede, and relate beliefs'),
  ('memory:admin', 'Promote beliefs across scopes and purge them');
--> statement-breakpoint
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-viewer', `key` FROM permissions WHERE `key` LIKE '%:read';
--> statement-breakpoint
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-member', `key` FROM permissions WHERE `key` LIKE '%:read' OR `key` LIKE '%:write';
--> statement-breakpoint
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-admin', `key` FROM permissions
WHERE `key` LIKE '%:read' OR `key` LIKE '%:write' OR `key` LIKE '%:admin' OR `key` = 'role:manage';
--> statement-breakpoint
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-owner', `key` FROM permissions;
