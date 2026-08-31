USE theatre_flow;

CREATE TABLE IF NOT EXISTS services (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  uses_theatre BOOLEAN NOT NULL DEFAULT FALSE,
  prep_duration_hours DECIMAL(4,2) NOT NULL DEFAULT 0,
  min_duration_hours DECIMAL(5,2) NOT NULL DEFAULT 0.5,
  max_duration_hours DECIMAL(5,2) NOT NULL DEFAULT 24,
  max_delay_days INT NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS doctors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  service_id INT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS nurses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  service_id INT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS theatres (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  service_id INT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS real_beds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  service_id INT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS patients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  appointment_id VARCHAR(30) NOT NULL UNIQUE,
  source_patient_id VARCHAR(30) NOT NULL,
  sex VARCHAR(20),
  age INT,
  age_group VARCHAR(20),
  service_id INT NOT NULL,
  requested_datetime DATETIME NOT NULL,
  duration_hours DECIMAL(8,2) NOT NULL,
  nurses_needed INT NOT NULL DEFAULT 1,
  real_dataset_status VARCHAR(30),
  original_duration_minutes DECIMAL(8,2),
  FOREIGN KEY (service_id) REFERENCES services(id),
  INDEX ix_patient_requested (requested_datetime),
  INDEX ix_patient_service (service_id)
);

CREATE TABLE IF NOT EXISTS schedule_results (
  id INT PRIMARY KEY AUTO_INCREMENT,
  patient_id INT NOT NULL,
  algorithm VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  scheduled_datetime DATETIME NULL,
  scheduled_end_datetime DATETIME NULL,
  delay_days DECIMAL(8,2),
  run_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  UNIQUE KEY uq_patient_run (patient_id, run_id),
  INDEX ix_schedule_run (run_id),
  INDEX ix_schedule_status (status)
);

CREATE TABLE IF NOT EXISTS resource_bookings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  patient_id INT NOT NULL,
  run_id VARCHAR(50) NOT NULL,
  resource_type ENUM('doctor','nurse','theatre','bed') NOT NULL,
  resource_code VARCHAR(30) NOT NULL,
  stage VARCHAR(20) NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  doctor_id INT NULL,
  nurse_id INT NULL,
  theatre_id INT NULL,
  bed_id INT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  FOREIGN KEY (nurse_id) REFERENCES nurses(id),
  FOREIGN KEY (theatre_id) REFERENCES theatres(id),
  FOREIGN KEY (bed_id) REFERENCES real_beds(id),
  INDEX ix_booking_resource_time (resource_type, resource_code, start_datetime, end_datetime),
  INDEX ix_booking_run_resource_time (run_id, resource_type, resource_code, start_datetime, end_datetime),
  INDEX ix_booking_run (run_id),
  INDEX ix_booking_patient (patient_id)
);

CREATE TABLE IF NOT EXISTS evaluation_conflict_summary (
  run_id VARCHAR(50) NOT NULL,
  resource_type ENUM('doctor','nurse','theatre','bed') NOT NULL,
  conflict_pairs BIGINT UNSIGNED NOT NULL DEFAULT 0,
  computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, resource_type)
);

CREATE TABLE IF NOT EXISTS import_audit (
  id INT PRIMARY KEY AUTO_INCREMENT,
  source_file VARCHAR(255) NOT NULL,
  rows_seen INT NOT NULL,
  patients_imported INT NOT NULL,
  bookings_imported INT NOT NULL,
  overnight_fixes INT NOT NULL,
  invalid_rows INT NOT NULL,
  run_id VARCHAR(50) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
