-- Splits three capabilities out of existing permissions so stored role
-- permission lists keep exactly the abilities they had:
--   candidates:reject  <- candidates:edit    (rejecting used to need edit)
--   offers:decide      <- offers:manage or offers:approve (recording the answer)
--   candidates:export  <- candidates:view    (CSV export used to need view only)
-- Only rows in custom_roles are touched: custom roles and the overrides saved
-- for built-in roles. Built-in role defaults live in code
-- (features/workspaces/permissions.ts). Idempotent: a row that already holds
-- the new permission is skipped, so re-running changes nothing.
UPDATE "custom_roles"
SET "permissions" = "permissions" || '["candidates:reject"]'::jsonb
WHERE jsonb_typeof("permissions") = 'array'
  AND "permissions" @> '["candidates:edit"]'::jsonb
  AND NOT "permissions" @> '["candidates:reject"]'::jsonb;--> statement-breakpoint
UPDATE "custom_roles"
SET "permissions" = "permissions" || '["offers:decide"]'::jsonb
WHERE jsonb_typeof("permissions") = 'array'
  AND ("permissions" @> '["offers:manage"]'::jsonb OR "permissions" @> '["offers:approve"]'::jsonb)
  AND NOT "permissions" @> '["offers:decide"]'::jsonb;--> statement-breakpoint
UPDATE "custom_roles"
SET "permissions" = "permissions" || '["candidates:export"]'::jsonb
WHERE jsonb_typeof("permissions") = 'array'
  AND "permissions" @> '["candidates:view"]'::jsonb
  AND NOT "permissions" @> '["candidates:export"]'::jsonb;
