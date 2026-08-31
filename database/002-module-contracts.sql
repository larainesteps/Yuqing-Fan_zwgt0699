USE theatre_flow;

CREATE TABLE IF NOT EXISTS clinical_notes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  patient_id INT NULL,
  external_case_id VARCHAR(100) NOT NULL,
  note_text LONGTEXT NOT NULL,
  language VARCHAR(20) NOT NULL DEFAULT 'zh-CN',
  source VARCHAR(50) NOT NULL DEFAULT 'synthetic',
  deidentified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_clinical_note_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  INDEX ix_clinical_note_case (external_case_id),
  INDEX ix_clinical_note_patient (patient_id)
);

CREATE TABLE IF NOT EXISTS nlp_extractions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  clinical_note_id BIGINT NOT NULL,
  contract_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(100) NOT NULL,
  status ENUM('PENDING','COMPLETED','REVIEW_REQUIRED','FAILED') NOT NULL DEFAULT 'PENDING',
  output_json JSON NULL,
  confidence DECIMAL(5,4) NULL,
  human_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  CONSTRAINT fk_extraction_note FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE CASCADE,
  INDEX ix_extraction_note (clinical_note_id),
  INDEX ix_extraction_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS priority_assessments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  patient_id INT NULL,
  extraction_id BIGINT NULL,
  external_case_id VARCHAR(100) NOT NULL,
  contract_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  policy_version VARCHAR(100) NOT NULL,
  priority_score DECIMAL(7,3) NOT NULL,
  priority_level ENUM('ROUTINE','URGENT','EMERGENCY') NOT NULL,
  components_json JSON NOT NULL,
  explanation_json JSON NOT NULL,
  assessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_priority_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  CONSTRAINT fk_priority_extraction FOREIGN KEY (extraction_id) REFERENCES nlp_extractions(id) ON DELETE SET NULL,
  INDEX ix_priority_case (external_case_id, assessed_at),
  INDEX ix_priority_score (priority_score)
);

CREATE TABLE IF NOT EXISTS optimization_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  run_key VARCHAR(100) NOT NULL UNIQUE,
  contract_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  algorithm VARCHAR(100) NOT NULL,
  status ENUM('PENDING','RUNNING','OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  horizon_start DATETIME NOT NULL,
  horizon_end DATETIME NOT NULL,
  slot_minutes SMALLINT NOT NULL DEFAULT 30,
  max_solve_seconds INT NOT NULL DEFAULT 60,
  request_json JSON NOT NULL,
  objective_value DOUBLE NULL,
  best_bound DOUBLE NULL,
  optimality_gap DOUBLE NULL,
  runtime_ms INT NULL,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX ix_optimization_status (status, created_at),
  INDEX ix_optimization_horizon (horizon_start, horizon_end)
);

CREATE TABLE IF NOT EXISTS optimization_assignments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  optimization_run_id BIGINT NOT NULL,
  patient_id INT NULL,
  external_case_id VARCHAR(100) NOT NULL,
  status ENUM('SCHEDULED','UNSCHEDULED') NOT NULL,
  start_datetime DATETIME NULL,
  end_datetime DATETIME NULL,
  resources_json JSON NOT NULL,
  rejection_reason VARCHAR(1000) NULL,
  CONSTRAINT fk_assignment_run FOREIGN KEY (optimization_run_id) REFERENCES optimization_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignment_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  UNIQUE KEY uq_assignment_run_case (optimization_run_id, external_case_id),
  INDEX ix_assignment_window (start_datetime, end_datetime)
);

CREATE TABLE IF NOT EXISTS evaluation_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  optimization_run_id BIGINT NOT NULL,
  baseline_run_key VARCHAR(100) NULL,
  contract_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  evaluation_version VARCHAR(100) NOT NULL,
  metrics_json JSON NOT NULL,
  conflicts_json JSON NOT NULL,
  workload_json JSON NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evaluation_run FOREIGN KEY (optimization_run_id) REFERENCES optimization_runs(id) ON DELETE CASCADE,
  INDEX ix_evaluation_run (optimization_run_id, generated_at)
);
