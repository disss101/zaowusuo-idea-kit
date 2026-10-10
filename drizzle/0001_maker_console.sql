CREATE TABLE IF NOT EXISTS employees (email TEXT PRIMARY KEY NOT NULL, user_id TEXT, roles_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_audit (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_audit_created ON admin_audit(created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS plan_reviews (project_id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, change_token TEXT NOT NULL, status TEXT NOT NULL, name TEXT, description TEXT, features_json TEXT, bom_json TEXT, engineering_note TEXT, physical_test TEXT, reason TEXT, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS components (sku TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, model TEXT, category TEXT, description TEXT, cost_fen INTEGER NOT NULL DEFAULT 0, price_fen INTEGER NOT NULL DEFAULT 0, supplier TEXT, stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0), minimum_stock INTEGER NOT NULL DEFAULT 0, specs_json TEXT NOT NULL DEFAULT '{}', verified INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS inventory_movements (id TEXT PRIMARY KEY NOT NULL, sku TEXT NOT NULL, delta INTEGER NOT NULL, balance_after INTEGER NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_movements_sku ON inventory_movements(sku, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS kits (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, price_fen INTEGER NOT NULL DEFAULT 0, difficulty TEXT, build_time TEXT, project_id TEXT, bom_json TEXT NOT NULL DEFAULT '[]', instructions TEXT, code_url TEXT, image_url TEXT, verification_status TEXT NOT NULL DEFAULT 'unverified', status TEXT NOT NULL DEFAULT 'draft', revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, project_id TEXT, order_id TEXT, step INTEGER, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal', assignee TEXT, public_reply TEXT, internal_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_owner ON support_tickets(owner_id, created_at DESC);
