-- Custom SQL migration file, put your code below! --

-- M10-T03 (ADR-0013 Option 5). Seeds the fixed 32-key permission vocabulary
-- and the four immutable system roles (org_id NULL marks a system role,
-- shared by every organization), then migrates every existing
-- organization_members row into an equivalent `grants` row at organization
-- scope. This is what makes exit criterion 4 ("every existing organization
-- behaves identically after migration") checkable: the role_permissions
-- compositions below are a direct restatement of lib/authz.ts's current
-- WRITER_ROLES/ADMIN_ROLES checks, not an independently designed vocabulary
-- hoped to line up.
--
-- `can()` (T04) does not exist yet and no handler reads `grants` until T05
-- replaces the assertOrg* call sites - this migration is inert data until
-- then. Deliberately NOT dual-written by the membership-mutation call sites
-- (seedOrg, updateOrgMemberRole, removeMember, consumePendingInvitations)
-- yet either: organization_members stays the sole write path through T04,
-- and T05 - the task that flips the *read* path onto grants - is where those
-- write sites also move, so there is exactly one task where both sides of
-- the cutover change together instead of a window where they could drift.
--
-- INSERT OR IGNORE on permissions/roles/role_permissions: every row here is
-- a singleton keyed by its own PK, so re-applying this migration against a
-- database that already has them is a no-op rather than a duplicate-key
-- error. The grants backfill is separately guarded with WHERE NOT EXISTS,
-- mirroring 0031_backfill_google_linked_identities.sql's guard, since a
-- grants.id never repeats but an unguarded re-run would otherwise mint a
-- second grant for the same (subject, scope, role).

INSERT OR IGNORE INTO permissions (key, description) VALUES
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
INSERT OR IGNORE INTO roles (id, org_id, name, is_system, created_at) VALUES
  ('role-viewer', NULL, 'viewer', 1, 0),
  ('role-member', NULL, 'member', 1, 0),
  ('role-admin', NULL, 'admin', 1, 0),
  ('role-owner', NULL, 'owner', 1, 0);
--> statement-breakpoint
-- viewer: every *:read permission and nothing else.
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-viewer', key FROM permissions WHERE key LIKE '%:read';
--> statement-breakpoint
-- member: viewer's reads plus every *:write (including team:write and
-- agent:write - members can create agents today, per lib/authz.ts's
-- WRITER_ROLES).
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-member', key FROM permissions WHERE key LIKE '%:read' OR key LIKE '%:write';
--> statement-breakpoint
-- admin: member's reads/writes plus every *:admin, plus role:manage
-- (creating/editing custom roles is itself gated on admin).
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-admin', key FROM permissions
WHERE key LIKE '%:read' OR key LIKE '%:write' OR key LIKE '%:admin' OR key = 'role:manage';
--> statement-breakpoint
-- owner: admin plus org:owner - every permission that exists, which is just
-- "every row in permissions".
INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'role-owner', key FROM permissions;
--> statement-breakpoint
-- Every existing organization_members row becomes an equivalent grant at
-- organization scope, keyed off the same role name the system role id
-- embeds ('role-' || role reproduces 'role-owner' etc. exactly, since those
-- are the four literal ids inserted above).
INSERT INTO grants (id, subject_type, subject_id, scope_type, scope_id, role_id, created_at)
SELECT
  'grant-' || lower(hex(randomblob(16))),
  'user',
  om.user_id,
  'organization',
  om.org_id,
  'role-' || om.role,
  om.joined_at
FROM organization_members om
WHERE NOT EXISTS (
  SELECT 1 FROM grants g
  WHERE g.subject_type = 'user' AND g.subject_id = om.user_id
    AND g.scope_type = 'organization' AND g.scope_id = om.org_id
    AND g.role_id = 'role-' || om.role
);
