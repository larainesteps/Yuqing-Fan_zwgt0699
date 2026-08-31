SET @suite_type_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='experiment_suites' AND column_name='suite_type'
);
SET @add_suite_type = IF(
  @suite_type_exists=0,
  "ALTER TABLE experiment_suites ADD COLUMN suite_type ENUM('COMPARISON','ABLATION') NOT NULL DEFAULT 'COMPARISON' AFTER source_run_key",
  'SELECT 1'
);
PREPARE add_suite_type_statement FROM @add_suite_type;
EXECUTE add_suite_type_statement;
DEALLOCATE PREPARE add_suite_type_statement;

SET @source_case_count_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='experiment_suites' AND column_name='source_case_count'
);
SET @add_source_case_count = IF(
  @source_case_count_exists=0,
  'ALTER TABLE experiment_suites ADD COLUMN source_case_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER random_seed',
  'SELECT 1'
);
PREPARE add_source_case_count_statement FROM @add_source_case_count;
EXECUTE add_source_case_count_statement;
DEALLOCATE PREPARE add_source_case_count_statement;
