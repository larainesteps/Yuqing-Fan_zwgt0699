USE theatre_flow;

ALTER TABLE patients
  MODIFY appointment_id VARCHAR(100) NOT NULL;

CREATE TABLE IF NOT EXISTS case_reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  clinical_note_id BIGINT NOT NULL,
  extraction_id BIGINT NOT NULL,
  patient_id INT NULL,
  external_case_id VARCHAR(100) NOT NULL,
  status ENUM('DRAFT','REVIEW_REQUIRED','APPROVED','REJECTED','SCHEDULED') NOT NULL DEFAULT 'REVIEW_REQUIRED',
  reviewed_json JSON NOT NULL,
  priority_json JSON NULL,
  reviewer VARCHAR(100) NULL,
  last_run_key VARCHAR(100) NULL,
  last_schedule_status ENUM('SCHEDULED','UNSCHEDULED') NULL,
  last_rejection_code VARCHAR(50) NULL,
  last_rejection_reason VARCHAR(1000) NULL,
  reviewed_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  scheduled_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_review_note FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_review_extraction FOREIGN KEY (extraction_id) REFERENCES nlp_extractions(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_review_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  UNIQUE KEY uq_case_review_case (external_case_id),
  UNIQUE KEY uq_case_review_extraction (extraction_id),
  INDEX ix_case_review_status (status, updated_at),
  INDEX ix_case_review_patient (patient_id)
);

CREATE TABLE IF NOT EXISTS case_audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_review_id BIGINT NOT NULL,
  actor VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_audit_review FOREIGN KEY (case_review_id) REFERENCES case_reviews(id) ON DELETE CASCADE,
  INDEX ix_case_audit_review (case_review_id, created_at),
  INDEX ix_case_audit_action (action, created_at)
);
