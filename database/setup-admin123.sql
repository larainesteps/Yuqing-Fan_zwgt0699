-- Run this after you can log in with a MySQL administrator account.
-- It prepares the project database and the admin123/admin123 app user.

CREATE DATABASE IF NOT EXISTS theatre_flow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'admin123'@'localhost' IDENTIFIED BY 'admin123';
ALTER USER 'admin123'@'localhost' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON theatre_flow.* TO 'admin123'@'localhost';

CREATE USER IF NOT EXISTS 'admin123'@'127.0.0.1' IDENTIFIED BY 'admin123';
ALTER USER 'admin123'@'127.0.0.1' IDENTIFIED BY 'admin123';
GRANT ALL PRIVILEGES ON theatre_flow.* TO 'admin123'@'127.0.0.1';

FLUSH PRIVILEGES;
