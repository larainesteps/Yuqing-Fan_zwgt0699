CREATE TABLE IF NOT EXISTS experiment_suites (
  id BIGINT NOT NULL AUTO_INCREMENT,
  suite_key VARCHAR(100) NOT NULL,
  source_run_id BIGINT NULL,
  source_run_key VARCHAR(100) NOT NULL,
  status ENUM('RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'RUNNING',
  scenario_count INT UNSIGNED NOT NULL,
  repetition_count INT UNSIGNED NOT NULL,
  random_seed INT UNSIGNED NOT NULL,
  config_json JSON NOT NULL,
  summary_json JSON NULL,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_experiment_suite_key (suite_key),
  KEY idx_experiment_suite_created (created_at),
  CONSTRAINT fk_experiment_source_run FOREIGN KEY (source_run_id)
    REFERENCES optimization_runs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS experiment_results (
  id BIGINT NOT NULL AUTO_INCREMENT,
  experiment_suite_id BIGINT NOT NULL,
  algorithm_code VARCHAR(64) NOT NULL,
  scenario_code VARCHAR(64) NOT NULL,
  case_count INT UNSIGNED NOT NULL,
  repetition_number INT UNSIGNED NOT NULL,
  random_seed INT UNSIGNED NOT NULL,
  solver_algorithm VARCHAR(100) NOT NULL,
  solver_status VARCHAR(20) NOT NULL,
  runtime_ms INT UNSIGNED NOT NULL,
  scheduled_cases INT UNSIGNED NOT NULL,
  unscheduled_cases INT UNSIGNED NOT NULL,
  theatre_utilisation_percent DECIMAL(8,2) NOT NULL,
  average_waiting_hours DECIMAL(12,2) NOT NULL,
  max_waiting_hours DECIMAL(12,2) NOT NULL,
  emergency_average_waiting_hours DECIMAL(12,2) NOT NULL,
  conflict_count INT UNSIGNED NOT NULL,
  hard_constraint_violations INT UNSIGNED NOT NULL,
  jain_fairness_index DECIMAL(8,4) NOT NULL,
  continuity_moved_cases INT UNSIGNED NOT NULL DEFAULT 0,
  result_json JSON NOT NULL,
  evaluation_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_experiment_result
    (experiment_suite_id,algorithm_code,scenario_code,case_count,repetition_number),
  KEY idx_experiment_result_compare (algorithm_code,scenario_code,case_count),
  CONSTRAINT fk_experiment_result_suite FOREIGN KEY (experiment_suite_id)
    REFERENCES experiment_suites(id) ON DELETE CASCADE
);
