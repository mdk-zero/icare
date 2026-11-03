-- =================================================================
-- 090: A storage bucket for retrained ML models.
--
-- The ML service retrains its at-risk models on iCARE data once there are
-- enough finalized grades (POST /models/retrain, nightly). The free host's
-- disk is wiped on every restart, so a model saved there would vanish while
-- ml_models still pointed at it. Retrained models are kept here instead, and
-- ml_models.artifact_url reads "storage:ml-models/<file>".
--
-- Private: only the service role (the ML service) reads or writes it, so no
-- policies are added. Nothing existing changes. Re-running is safe.
-- =================================================================

insert into storage.buckets (id, name, public)
values ('ml-models', 'ml-models', false)
on conflict (id) do nothing;
