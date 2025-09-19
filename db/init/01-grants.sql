-- Initialize DBs and grant privileges (MySQL 8 syntax)
CREATE DATABASE IF NOT EXISTS `clawhunters`;
CREATE DATABASE IF NOT EXISTS `clawhunters_shadow`;

CREATE USER IF NOT EXISTS 'appuser'@'%' IDENTIFIED BY 'apppass';
ALTER USER 'appuser'@'%' IDENTIFIED BY 'apppass';

GRANT ALL PRIVILEGES ON `clawhunters`.*        TO 'appuser'@'%';
GRANT ALL PRIVILEGES ON `clawhunters_shadow`.* TO 'appuser'@'%';
FLUSH PRIVILEGES;
