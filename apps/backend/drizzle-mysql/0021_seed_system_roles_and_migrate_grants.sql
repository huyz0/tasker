-- Custom SQL migration file, put your code below! --

-- M10-T03 (ADR-0013). See the SQLite counterpart for the full reasoning:
-- fixed permission vocabulary, four immutable system roles, and a backfill
-- of every existing organization_members row into an equivalent `grants`
-- row. Not dual-written by the membership-mutation call sites yet - see the
-- SQLite file's header note, same reasoning applies unchanged here.
--
-- `INSERT IGNORE` on permissions/roles/role_permissions: every row is a
-- singleton keyed by its own PK, so a re-run against a database that
-- already has them is a no-op. `roles.created_at` is omitted from the
-- INSERT list below (unlike the SQLite edition's literal `0`) so it takes
-- its column default (`now()`) instead - MySQL's `timestamp` type has no
-- equivalent "epoch zero" literal worth spending a CAST on for four rows.

INSERT IGNORE INTO permissions (`key`, description) VALUES
  ('org:read', 'View organization details and membership'),
  ('org:admin', 'Manage organization settings, members, and roles'),
  ('org:owner', 'Transfer or delete the organization - the highest tier'),
  ('project:read', 'View projects and project templates'),
  ('project:write', 'Create and edit projects and project templates'),
  ('project:admin', 'Delete and archive projects'),
  ('tasktype:read', 'View task types'),
  ('tasktype:write', 'Create and edit task types'),
  ('task:read', 'View tasks'),
  ('task:write', 'Create and edit tasks'),
  ('task:admin', 'Delete and archive tasks'),
  ('tasknote:read', 'View task notes'),
  ('tasknote:write', 'Create and edit task notes'),
  ('agent:read', 'View agent roles, instances, and tokens'),
  ('agent:write', 'Create and edit agent roles and instances'),
  ('agent:admin', 'Delete agents and manage agent tokens'),
  ('artifact:read', 'View artifacts and artifact folders'),
  ('artifact:write', 'Create and edit artifacts and folders'),
  ('artifact:admin', 'Delete artifacts and folders'),
  ('comment:read', 'View comments'),
  ('comment:write', 'Create and edit comments'),
  ('label:read', 'View labels'),
  ('label:write', 'Create and edit labels'),
  ('repository:read', 'View linked repositories and pull requests'),
  ('repository:write', 'Link repositories and sync pull requests'),
  ('repository:admin', 'Unlink repositories'),
  ('search:read', 'Search across organization data'),
  ('dashboard:read', 'View dashboards'),
  ('team:read', 'View teams and team membership'),
  ('team:write', 'Create teams and manage membership'),
  ('team:admin', 'Delete teams'),
  ('role:manage', 'Create, edit, and delete custom roles');
--> statement-breakpoint
INSERT IGNORE INTO roles (id, org_id, name, is_system) VALUES
  ('role-viewer', NULL, 'viewer', true),
  ('role-member', NULL, 'member', true),
  ('role-admin', NULL, 'admin', true),
  ('role-owner', NULL, 'owner', true);
--> statement-breakpoint
-- viewer: every *:read permission and nothing else.
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-viewer', `key` FROM permissions WHERE `key` LIKE '%:read';
--> statement-breakpoint
-- member: viewer's reads plus every *:write.
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-member', `key` FROM permissions WHERE `key` LIKE '%:read' OR `key` LIKE '%:write';
--> statement-breakpoint
-- admin: member's reads/writes plus every *:admin, plus role:manage.
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-admin', `key` FROM permissions
WHERE `key` LIKE '%:read' OR `key` LIKE '%:write' OR `key` LIKE '%:admin' OR `key` = 'role:manage';
--> statement-breakpoint
-- owner: every permission that exists.
INSERT IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-owner', `key` FROM permissions;
--> statement-breakpoint
-- Every existing organization_members row becomes an equivalent grant at
-- organization scope. WHERE NOT EXISTS keeps this idempotent against a
-- re-run, same guard as the SQLite edition.
INSERT INTO grants (id, subject_type, subject_id, scope_type, scope_id, role_id, created_at)
SELECT
  CONCAT('grant-', UUID()),
  'user',
  om.user_id,
  'organization',
  om.org_id,
  CONCAT('role-', om.role),
  om.joined_at
FROM organization_members om
WHERE NOT EXISTS (
  SELECT 1 FROM grants g
  WHERE g.subject_type = 'user' AND g.subject_id = om.user_id
    AND g.scope_type = 'organization' AND g.scope_id = om.org_id
    AND g.role_id = CONCAT('role-', om.role)
);
