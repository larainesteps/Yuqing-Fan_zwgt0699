USE theatre_flow;

SET @run_type_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='optimization_runs' AND column_name='run_type'
);
SET @add_run_type = IF(
  @run_type_exists=0,
  "ALTER TABLE optimization_runs ADD COLUMN run_type ENUM('STANDARD','EMERGENCY_INSERTION') NOT NULL DEFAULT 'STANDARD' AFTER contract_version",
  'SELECT 1'
);
PREPARE add_run_type_statement FROM @add_run_type;
EXECUTE add_run_type_statement;
DEALLOCATE PREPARE add_run_type_statement;

SET @baseline_run_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='optimization_runs' AND column_name='baseline_run_key'
);
SET @add_baseline_run = IF(
  @baseline_run_exists=0,
  'ALTER TABLE optimization_runs ADD COLUMN baseline_run_key VARCHAR(100) NULL AFTER run_type',
  'SELECT 1'
);
PREPARE add_baseline_run_statement FROM @add_baseline_run;
EXECUTE add_baseline_run_statement;
DEALLOCATE PREPARE add_baseline_run_statement;

CREATE TABLE IF NOT EXISTS schedule_case_locks (
  external_case_id VARCHAR(100) PRIMARY KEY,
  patient_id INT NULL,
  lock_reason VARCHAR(500) NOT NULL,
  actor VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedule_lock_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX ix_schedule_lock_patient (patient_id)
);

CREATE TABLE IF NOT EXISTS reschedule_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  optimization_run_id BIGINT NOT NULL,
  baseline_run_key VARCHAR(100) NOT NULL,
  emergency_case_review_id BIGINT NOT NULL,
  emergency_case_id VARCHAR(100) NOT NULL,
  freeze_before_datetime DATETIME NOT NULL,
  actor VARCHAR(100) NOT NULL,
  status ENUM('COMPLETED','FAILED') NOT NULL,
  unchanged_cases INT NOT NULL DEFAULT 0,
  moved_cases INT NOT NULL DEFAULT 0,
  dropped_cases INT NOT NULL DEFAULT 0,
  inserted_cases INT NOT NULL DEFAULT 0,
  total_shift_minutes INT NOT NULL DEFAULT 0,
  resource_changes INT NOT NULL DEFAULT 0,
  changes_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reschedule_optimization FOREIGN KEY (optimization_run_id) REFERENCES optimization_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_reschedule_review FOREIGN KEY (emergency_case_review_id) REFERENCES case_reviews(id) ON DELETE CASCADE,
  UNIQUE KEY uq_reschedule_optimization (optimization_run_id),
  INDEX ix_reschedule_baseline (baseline_run_key, created_at),
  INDEX ix_reschedule_emergency (emergency_case_id, created_at)
);
