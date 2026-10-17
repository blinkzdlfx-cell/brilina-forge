-- Verification for migration 007. Run after 006 and 007 on the same branch.
SELECT
  to_regclass('public.github_app_installations') IS NOT NULL AS installations_table_exists,
  to_regclass('public.github_installation_access') IS NOT NULL AS access_table_exists,
  to_regclass('public.github_installation_repositories') IS NOT NULL AS repositories_table_exists,
  to_regclass('public.github_app_installation_states') IS NOT NULL AS state_table_exists,
  to_regclass('public.github_app_webhook_deliveries') IS NOT NULL AS webhook_delivery_table_exists,
  (SELECT count(*) FROM runs WHERE repository_full_name_snapshot IS NULL OR branch_name_snapshot IS NULL) AS runs_missing_existing_context,
  (SELECT count(*) FROM github_installation_access a LEFT JOIN github_app_installations i ON i.id=a.installation_record_id WHERE i.id IS NULL) AS orphan_installation_access,
  (SELECT count(*) FROM github_installation_access a LEFT JOIN auth_identities i ON i.id=a.auth_identity_id AND i.user_id=a.user_id WHERE i.id IS NULL) AS invalid_access_identity_links;
