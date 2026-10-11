# Emissão parcial — PostgreSQL isolado

Este teste aplica a migration real em schema mínimo sintético, sem Supabase,
sem credenciais do projeto e sem pagamentos. O container deve estar vazio.

```sh
docker run -d --name smartbus-ticket-test-local -e POSTGRES_PASSWORD=local-test-only postgres:16
docker exec smartbus-ticket-test-local pg_isready -U postgres
TICKET_TEST_CONTAINER=smartbus-ticket-test-local node tests/database/partial-ticket-issuance.mjs
docker rm -f smartbus-ticket-test-local
```

Aguarde `pg_isready` antes de executar. O teste cria tabelas e roles: não reutilize
bancos existentes. Testa inserção parcial histórica e identificada, ida/volta,
itens legítimos repetidos sem poltrona, snapshots incompatíveis, rollback,
reexecução e duas conexões PostgreSQL simultâneas sob a trava real.
Não cobre todas as migrations/triggers/RLS do Supabase nem o Sandbox financeiro.
