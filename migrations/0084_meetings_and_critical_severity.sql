-- Meeting capture + critical severity for the stakeholder view.
--
-- Two distinct meeting concepts, modeled the lightest possible way:
--
-- 1. Milestone meetings live on tasks. A task with a meeting_join_url is a
--    meeting. This piggybacks on the timeline PMs already maintain — the
--    kickoff / discovery / design-review / UAT / go-live tasks come from
--    templates, so the only PM lift is pasting a Zoom URL on each one.
--    Cascade moves the task and the meeting together for free.
--
-- 2. Recurring status meetings live on the project itself. PMs set the
--    cadence once (e.g. "Wednesdays 3:30 PM PT, 30 min") and never touch
--    it again — the stakeholder view computes the next occurrence on the
--    fly. status_meeting_dow uses 0=Sun … 6=Sat to match JS Date.getDay().
--
-- The risks.severity column was always free-form TEXT (see 0001_initial),
-- so adding 'critical' as a new level needs no schema change — it's a
-- pure UI + health-score weighting concern.

ALTER TABLE tasks ADD COLUMN meeting_join_url TEXT;

ALTER TABLE projects ADD COLUMN status_meeting_title TEXT;
ALTER TABLE projects ADD COLUMN status_meeting_dow INTEGER;
ALTER TABLE projects ADD COLUMN status_meeting_time_local TEXT;
ALTER TABLE projects ADD COLUMN status_meeting_timezone TEXT;
ALTER TABLE projects ADD COLUMN status_meeting_duration_min INTEGER;
ALTER TABLE projects ADD COLUMN status_meeting_join_url TEXT;
