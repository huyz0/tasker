CREATE TABLE saved_views (
  id varchar(256) PRIMARY KEY NOT NULL,
  org_id varchar(256) NOT NULL,
  project_id varchar(256) NOT NULL,
  owner_user_id varchar(256) NOT NULL,
  screen varchar(16) NOT NULL,
  visibility varchar(16) NOT NULL,
  audience_key varchar(272) NOT NULL,
  name varchar(128) NOT NULL,
  name_key varchar(64) NOT NULL,
  definition_json text NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT saved_views_org_fk FOREIGN KEY(org_id) REFERENCES organizations(id),
  CONSTRAINT saved_views_owner_fk FOREIGN KEY(owner_user_id) REFERENCES users(id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX saved_views_name_idx ON saved_views(org_id, screen, audience_key, name_key);
--> statement-breakpoint
CREATE INDEX saved_views_scope_page_idx ON saved_views(org_id, screen, visibility, created_at, id);
--> statement-breakpoint
CREATE INDEX saved_views_owner_idx ON saved_views(org_id, screen, owner_user_id, visibility);
