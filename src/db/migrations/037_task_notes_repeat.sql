-- Tasks: your own notes on a task (kept apart from the message it came
-- from), and repeating tasks. A repeating task, when done, opens its next
-- occurrence; they show in their own Recurring section on To Do.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat TEXT CHECK (repeat IN ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly'));
