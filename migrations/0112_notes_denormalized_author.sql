-- Client (customer portal) users are synthetic AppUsers built from a Dynamics
-- portal contact — their id is the D365 contactid and they have NO row in the
-- users table. notes.author_user_id has a FK to users(id), so a client posting
-- a comment on the Activity tab hit a FOREIGN KEY constraint failure → 500.
--
-- Denormalize the author's display name + org onto the note so we can store
-- NULL for author_user_id when the author isn't a real DB user, without losing
-- attribution. The GET/created SELECTs COALESCE the users-join name with these.
ALTER TABLE notes ADD COLUMN author_name TEXT;
ALTER TABLE notes ADD COLUMN author_org TEXT;
