# Connect Authorization e multiempresa

Use esta referência para onboarding, autorização, armazenamento, renovação, revogação e isolamento de credenciais.

## Fluxo preferencial

1. SmartBus cria e mantém uma aplicação PagBank por ambiente conforme a homologação.
2. Admin autorizado escolhe PagBank dentro da empresa correta.
3. Backend cria tentativa de conexão vinculada a `company_id`, ambiente, usuário, nonce e expiração.
4. Redireciona para o Connect Authorization oficial com `client_id`, `response_type=code`, `redirect_uri`, scopes mínimos e `state` imprevisível.
5. Callback valida `state`, usuário, empresa, ambiente, uso único e expiração antes de trocar o `code`.
6. Backend troca o código por `access_token` e `refresh_token` usando credenciais da aplicação no ambiente correto.
7. Backend consulta/valida a conta autorizada e persiste o vínculo com a empresa.
8. Credenciais são armazenadas cifradas e nunca retornadas ao frontend.
9. Conexão só fica operacional após diagnóstico dos recursos exigidos.

## Evidência oficial relevante

- Connect permite que aplicações e marketplaces atuem em nome de vendedores.
- `code` é de uso único e tem validade documentada de 10 minutos.
- Connect Authorization usa URLs diferentes em Sandbox e Produção.
- Scopes publicados incluem `payments.read`, `payments.create`, `payments.refund`, `accounts.read` e `payments.split.read` em páginas aplicáveis.
- Renovação rotaciona `access_token` e `refresh_token`; o refresh token anterior é invalidado após uso.
- Revogação oficial aceita access token ou refresh token.

## Regras de segurança

- Trate `state` como defesa CSRF e vínculo de contexto, não como campo descritivo livre.
- Não coloque `company_id`, ambiente ou segredo em `state` sem integridade e confidencialidade adequadas. Prefira identificador opaco para registro server-side.
- Callback não pode aceitar empresa escolhida pelo navegador como fonte de verdade.
- Use scopes mínimos. Não solicite `checkout.*`, pois checkout hospedado está fora do projeto.
- Refresh deve ser serializado por conexão. Duas renovações concorrentes podem invalidar a credencial recém-gerada.
- Registre versão/geração da credencial e use controle otimista ou lock para rotação.
- Revogação ou falha permanente de refresh deve desabilitar PagBank para novas vendas da empresa, sem alterar vendas antigas.
- Nunca reutilize token de uma empresa para consultar ou operar venda de outra.

## Modelo conceitual mínimo

Não imponha nomes de tabelas sem inspecionar o projeto. A representação precisa distinguir:

- empresa;
- gateway;
- ambiente;
- status da conexão;
- account ID do vendedor;
- access token cifrado;
- refresh token cifrado;
- expiração;
- scopes concedidos;
- aplicação/client ID utilizada;
- geração da credencial;
- timestamps de conexão, renovação e revogação;
- causa operacional quando indisponível.

O `client_secret`, tokens e token de webhook são secretos. Chave pública para criptografia de cartão não é secreta, mas continua vinculada à conta e ao ambiente corretos.

## Configuração manual

Só aceite configuração manual se a documentação/contrato PagBank e a arquitetura do projeto realmente exigirem. Ela deve ter a mesma validação de conta, ambiente, escopo, armazenamento e auditoria do fluxo Connect. Nunca peça secret em mensagem, issue, commit ou log.

## Gates

Classifique como `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO` até testar:

- criação da aplicação e callback nos domínios oficiais do SmartBus;
- scopes efetivamente concedidos para split e refund;
- consulta segura do account ID autorizado;
- renovação com concorrência e rotação do refresh token;
- revogação e reconexão;
- contas distintas para Empresa A/B em Sandbox e Produção;
- comportamento de vendedor que muda e-mail ou revoga acesso;
- conta autorizada sem PIX, split ou produto comercial habilitado.

