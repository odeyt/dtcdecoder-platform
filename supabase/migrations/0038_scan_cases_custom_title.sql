-- Lets a customer give a case its own short label (e.g. "Mom's Honda —
-- AC issue") so their case list is easy to tell apart at a glance,
-- independent of `complaint` (the actual diagnostic-input text the AI
-- reads — kept separate so renaming a case for organizational purposes
-- never touches what was actually diagnosed).
alter table scan_cases
  add column if not exists title text;
