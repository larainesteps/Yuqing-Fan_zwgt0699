USE theatre_flow;

SET @rejection_code_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'optimization_assignments'
    AND column_name = 'rejection_code'
);
SET @add_rejection_code = IF(
  @rejection_code_exists = 0,
  'ALTER TABLE optimization_assignments ADD COLUMN rejection_code VARCHAR(50) NULL AFTER resources_json',
  'SELECT 1'
);
PREPARE add_rejection_code_statement FROM @add_rejection_code;
EXECUTE add_rejection_code_statement;
DEALLOCATE PREPARE add_rejection_code_statement;

SET @rejection_code_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'optimization_assignments'
    AND index_name = 'ix_assignment_rejection_code'
);
SET @add_rejection_code_index = IF(
  @rejection_code_index_exists = 0,
  'CREATE INDEX ix_assignment_rejection_code ON optimization_assignments (rejection_code)',
  'SELECT 1'
);
PREPARE add_rejection_code_index_statement FROM @add_rejection_code_index;
EXECUTE add_rejection_code_index_statement;
DEALLOCATE PREPARE add_rejection_code_index_statement;
