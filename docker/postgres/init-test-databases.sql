-- Executado só na primeira subida do volume. Cria os bancos usados pelos testes automatizados
-- (o banco principal "arremate" já é criado pela variável POSTGRES_DB).
CREATE DATABASE arremate_test OWNER arremate;
CREATE DATABASE arremate_e2e OWNER arremate;
