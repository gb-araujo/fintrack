-- Executado pelo container postgres apenas na PRIMEIRA inicialização do volume (docker-compose.yml).
-- Banco separado para testes de integração (TEST_DATABASE_URL), nunca o banco de desenvolvimento.
CREATE DATABASE fintrack_test;
