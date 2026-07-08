# Análise — Motorista também vendedor e acesso ao validador QR Code

## Objetivo

Validar se uma pessoa que já possui acesso operacional de motorista continua acessando e usando o validador de QR Code após também ser vinculada como vendedora da mesma empresa.

## Evidências no código

### 1. O vínculo criado pela tela de motoristas não altera `user_roles`

A ação de vínculo adicionada em `src/pages/admin/Drivers.tsx` cria ou reativa um registro em `sellers`, sempre filtrando pela empresa ativa e pelo CPF normalizado. O fluxo não atualiza `user_roles`, não altera `role`, não altera `driver_id` e não grava `seller_id` no usuário autenticado.

Impacto: a permissão principal do usuário motorista permanece como estava antes do vínculo operacional de vendedor.

### 2. A autenticação usa `user_roles` como fonte de verdade

`AuthContext` carrega `user_roles` do usuário autenticado e define `userRole`/`sellerId` a partir do vínculo da empresa ativa. Como o novo vínculo motorista → vendedor não altera `user_roles`, ele não muda automaticamente um usuário `motorista` para `vendedor`.

Observação importante: o schema atual tem unicidade por `user_id + company_id` em `user_roles`, então o sistema trabalha com um papel técnico principal por empresa. A dupla atuação implementada aqui é operacional/cadastral (`drivers` + `sellers`), não uma troca silenciosa de papel de autenticação.

### 3. A tela de validação continua protegida por papel de motorista/operacional

`DriverValidate` permite acesso quando `userRole` é `motorista`, `operador`, `gerente` ou `developer`. O papel `vendedor` isolado não entra nesse guard. Portanto, se o usuário já acessava como motorista e o `user_roles.role` continua `motorista`, ele mantém acesso ao validador.

### 4. A listagem de viagens/embarques continua baseada em `driver_id`

`DriverHome` e `DriverBoarding` consultam `user_roles.driver_id` para buscar viagens vinculadas ao motorista/auxiliar e só fazem fallback para viagens da empresa quando não há viagem específica. Nenhuma dessas consultas usa `sellers` ou `seller_id`.

Impacto: criar um cadastro em `sellers` para o mesmo CPF não muda a lista de viagens do validador.

### 5. A leitura/validação de QR Code continua independente de `seller_id`

`DriverValidate` chama a RPC `validate_ticket_scan` com token do QR, ação, informações do dispositivo e origem `scanner`. A RPC valida empresa pelo usuário autenticado, registra auditoria com `validated_by_user_id` e resolve `validated_by_driver_id` a partir de `user_roles.driver_id` na empresa da passagem. Não há dependência de `sellers` ou `seller_id` nesse fluxo.

Impacto: o mesmo usuário motorista continua validando passagens normalmente; aparecer como vendedor só afeta fluxos comerciais que usam `seller_id` em vendas/comissões.

## Resultado da validação

- [x] Acesso à tela de motorista/embarque continua baseado no papel técnico em `user_roles`.
- [x] Criar vínculo em `sellers` não altera papel principal do usuário.
- [x] `user_roles.driver_id` continua sendo usado para viagens e auditoria de validação.
- [x] Listagem de viagens/embarques não usa `seller_id`.
- [x] Leitura/validação de QR Code não usa `seller_id`.
- [x] Não foi encontrada lógica no validador que escolha `seller_id` e ignore `driver_id`.

## Conclusão

Com o desenho atual, uma pessoa cadastrada como motorista e também vinculada como vendedora:

1. continua acessando a tela de validação QR Code se seu `user_roles.role` permanecer `motorista`;
2. continua validando passagens normalmente via RPC `validate_ticket_scan`;
3. aparece como vendedora apenas nos fluxos de venda/comissão que usam `sellers`/`seller_id`;
4. não perde permissão de motorista, porque o vínculo operacional em `sellers` não altera `user_roles`.

## Risco operacional observado

Se, futuramente, algum fluxo de usuários trocar o registro de `user_roles` da pessoa de `motorista` para `vendedor` na mesma empresa, o acesso ao validador será perdido porque o guard do validador não permite `vendedor` isolado. Isso não é causado pelo vínculo implementado em `Drivers.tsx`, mas deve ser evitado no cadastro de usuários: para dupla atuação operacional, manter o papel técnico de motorista e usar `sellers` apenas para comissão/vendas.
