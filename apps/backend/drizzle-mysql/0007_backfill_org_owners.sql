-- Custom SQL migration file, put your code below! --

-- Promotes exactly one existing 'admin' per organization to the new
-- 'owner' role, so every org has an owner once this migration lands
-- (older rows only ever had 'admin'/'member', never 'owner'). Picks the
-- earliest-joined admin per org, tie-broken by user_id, as the new owner -
-- an arbitrary but deterministic choice; orgs can reassign ownership
-- afterwards via updateOrgMemberRole.
UPDATE organization_members om
JOIN (
  SELECT org_id, user_id
  FROM (
    SELECT org_id, user_id,
      ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY joined_at ASC, user_id ASC) AS rn
    FROM organization_members
    WHERE role = 'admin'
  ) ranked
  WHERE rn = 1
) first_admin ON first_admin.org_id = om.org_id AND first_admin.user_id = om.user_id
SET om.role = 'owner'
WHERE om.role = 'admin';
