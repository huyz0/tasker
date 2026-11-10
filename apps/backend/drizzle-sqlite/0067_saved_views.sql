CREATE TABLE saved_views (
  id text PRIMARY KEY NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id),
  project_id text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users(id),
  screen text NOT NULL,
  visibility text NOT NULL,
  audience_key text NOT NULL,
  name text NOT NULL,
  name_key text NOT NULL,
  definition_json text NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX saved_views_name_idx ON saved_views(org_id, screen, audience_key, name_key);
--> statement-breakpoint
CREATE INDEX saved_views_scope_page_idx ON saved_views(org_id, screen, visibility, created_at, id);
--> statement-breakpoint
CREATE INDEX saved_views_owner_idx ON saved_views(org_id, screen, owner_user_id, visibility);
