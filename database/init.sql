CREATE DATABASE IF NOT EXISTS theatre_flow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'admin123'@'localhost' IDENTIFIED BY 'admin123';
ALTER USER 'admin123'@'localhost' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON theatre_flow.* TO 'admin123'@'localhost';

CREATE USER IF NOT EXISTS 'admin123'@'127.0.0.1' IDENTIFIED BY 'admin123';
ALTER USER 'admin123'@'127.0.0.1' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON theatre_flow.* TO 'admin123'@'127.0.0.1';

FLUSH PRIVILEGES;

USE theatre_flow;

CREATE TABLE IF NOT EXISTS staff (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  role ENUM('SURGEON','ANAESTHETIST','NURSE') NOT NULL,
  speciality VARCHAR(80) NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS operating_theatres (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL UNIQUE,
  speciality VARCHAR(80) NOT NULL,
  available_from TIME NOT NULL,
  available_to TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS beds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ward VARCHAR(60) NOT NULL,
  bed_code VARCHAR(20) NOT NULL UNIQUE,
  bed_type ENUM('DAY_CASE','WARD','HDU','ICU') NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS surgical_cases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  case_ref VARCHAR(20) NOT NULL UNIQUE,
  procedure_name VARCHAR(120) NOT NULL,
  speciality VARCHAR(80) NOT NULL,
  priority ENUM('ROUTINE','URGENT','EMERGENCY') NOT NULL,
  duration_minutes INT NOT NULL,
  recovery_minutes INT NOT NULL DEFAULT 60,
  required_bed_type ENUM('DAY_CASE','WARD','HDU','ICU') NOT NULL,
  requested_date DATE NOT NULL,
  status ENUM('WAITING','SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'WAITING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  algorithm ENUM('GREEDY','PRIORITY_FIT') NOT NULL,
  schedule_date DATE NOT NULL,
  scheduled_count INT NOT NULL,
  unscheduled_count INT NOT NULL,
  theatre_utilisation DECIMAL(5,2) NOT NULL,
  runtime_ms INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scheduled_operations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_id INT NOT NULL,
  case_id INT NOT NULL,
  theatre_id INT NOT NULL,
  surgeon_id INT NOT NULL,
  anaesthetist_id INT NOT NULL,
  nurse_id INT NOT NULL,
  bed_id INT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  FOREIGN KEY (run_id) REFERENCES schedule_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES surgical_cases(id),
  FOREIGN KEY (theatre_id) REFERENCES operating_theatres(id),
  FOREIGN KEY (surgeon_id) REFERENCES staff(id),
  FOREIGN KEY (anaesthetist_id) REFERENCES staff(id),
  FOREIGN KEY (nurse_id) REFERENCES staff(id),
  FOREIGN KEY (bed_id) REFERENCES beds(id)
);

INSERT IGNORE INTO staff (id,name,role,speciality,shift_start,shift_end) VALUES
 (1,'Dr. Maya Chen','SURGEON','Orthopaedics','08:00','17:00'),
 (2,'Dr. James Wright','SURGEON','General Surgery','08:00','17:00'),
 (3,'Dr. Sofia Malik','SURGEON','Cardiology','08:00','18:00'),
 (4,'Dr. Oliver Reed','ANAESTHETIST','General','07:30','17:30'),
 (5,'Dr. Hannah Cole','ANAESTHETIST','Cardiac','08:00','18:00'),
 (6,'Nurse Aisha Khan','NURSE','Orthopaedics','07:30','16:30'),
 (7,'Nurse Leo Martin','NURSE','General Surgery','08:00','18:00'),
 (8,'Nurse Priya Shah','NURSE','Cardiology','08:00','18:00');
INSERT IGNORE INTO operating_theatres (id,name,speciality,available_from,available_to) VALUES
 (1,'Theatre 1','Orthopaedics','08:00','17:00'),(2,'Theatre 2','General Surgery','08:00','17:00'),(3,'Theatre 3','Cardiology','08:00','18:00');
INSERT IGNORE INTO beds (id,ward,bed_code,bed_type) VALUES
 (1,'Day Surgery','DS-01','DAY_CASE'),(2,'Surgical Ward','SW-12','WARD'),(3,'Surgical Ward','SW-14','WARD'),(4,'HDU','HDU-03','HDU'),(5,'ICU','ICU-02','ICU');
INSERT IGNORE INTO surgical_cases (id,case_ref,procedure_name,speciality,priority,duration_minutes,recovery_minutes,required_bed_type,requested_date) VALUES
 (1,'SC-1042','Hip replacement','Orthopaedics','URGENT',150,120,'WARD',CURRENT_DATE),
 (2,'SC-1048','Laparoscopic cholecystectomy','General Surgery','ROUTINE',90,60,'DAY_CASE',CURRENT_DATE),
 (3,'SC-1051','Coronary artery bypass','Cardiology','URGENT',240,180,'ICU',CURRENT_DATE),
 (4,'SC-1057','Knee arthroscopy','Orthopaedics','ROUTINE',60,45,'DAY_CASE',CURRENT_DATE),
 (5,'SC-1060','Appendectomy','General Surgery','EMERGENCY',75,90,'WARD',CURRENT_DATE),
 (6,'SC-1063','Cardiac valve repair','Cardiology','ROUTINE',210,180,'HDU',CURRENT_DATE);
