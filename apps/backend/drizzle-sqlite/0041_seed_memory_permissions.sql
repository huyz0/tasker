-- Custom SQL migration file, put your code below! --

-- M21-T03 (ADR-0014). Adds the memory:{read,write,admin} permission family
-- for the shared belief system, following 0034_seed_system_roles_and_migrate_
-- grants.sql's exact pattern: INSERT OR IGNORE the three new permission rows,
-- then re-run the same four wildcard SELECTs into role_permissions. Every
-- existing (role_id, permission_key) pair is already present and skipped by
-- OR IGNORE; only the three new memory:* keys are new inserts, landing in
-- viewer (memory:read), member (memory:read, memory:write), admin and owner
-- (all three, including memory:admin) - the same *:read/*:write/*:admin
-- tiering every other family already gets, with no new logic to write.

INSERT OR IGNORE INTO permissions (key, description) VALUES
  ('memory:read', 'Search and view shared beliefs'),
  ('memory:write', 'Record, update, supersede, and relate beliefs'),
  ('memory:admin', 'Promote beliefs across scopes and purge them');
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-viewer', key FROM permissions WHERE key LIKE '%:read';
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-member', key FROM permissions WHERE key LIKE '%:read' OR key LIKE '%:write';
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-admin', key FROM permissions
WHERE key LIKE '%:read' OR key LIKE '%:write' OR key LIKE '%:admin' OR key = 'role:manage';
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-owner', key FROM permissions;
