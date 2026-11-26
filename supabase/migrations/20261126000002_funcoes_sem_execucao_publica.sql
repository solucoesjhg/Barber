-- ================================================================
--  Funções novas não nascem executáveis por quem não fez login
-- ================================================================
-- O Postgres dá EXECUTE ao PUBLIC (todo mundo, inclusive o anon) em toda
-- função criada. A migração de segurança (20261112) tirou das funções que
-- já existiam, mas o "ALTER DEFAULT PRIVILEGES ... IN SCHEMA public" não
-- consegue tirar esse padrão do PUBLIC: só o padrão global consegue. Por
-- isso as funções criadas depois (excluir_produto, definir_tela_inicial,
-- salvar_permissoes_usuario) ficaram chamáveis sem login. Elas conferem a
-- permissão e recusam, mas não devem nem ser chamáveis.
--
-- O usuário logado (authenticated) continua com o EXECUTE que já tem
-- (dado explicitamente a cada função); as funções internas que tiveram
-- o acesso dele retirado continuam fechadas.

-- Padrão global: daqui para frente, função nova não vai para o PUBLIC.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- As que já existem.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
