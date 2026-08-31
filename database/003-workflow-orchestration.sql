USE theatre_flow;

ALTER TABLE priority_assessments
  MODIFY priority_level ENUM('UNKNOWN','ROUTINE','EXPEDITED','URGENT','EMERGENCY') NOT NULL;

ALTER TABLE priority_assessments
  MODIFY priority_score DECIMAL(7,3) NOT NULL;
