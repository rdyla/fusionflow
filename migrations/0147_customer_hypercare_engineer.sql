-- A customer can be temporarily routed to one specific internal engineer for
-- hypercare-style support (e.g. a just-completed implementation that isn't
-- normally entitled to ongoing support, but needs 1-2 weeks of post-go-live
-- coverage from the engineer who knows the build). Manual on/off: an admin
-- sets this on the customer record, and clears it when the hypercare window
-- ends. No expiry logic — same manual-assignment model as pf_ae/pf_sa/pf_csm.
ALTER TABLE customers ADD COLUMN hypercare_engineer_user_id TEXT;
