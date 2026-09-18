# Guia decisório — credenciais PagBank direto no SmartBus

**Conclusão:** não use PB Integrações. O SmartBus seguirá pela API oficial do PagBank.

## Onde você está e para onde deve ir

Você está no local certo para o Sandbox: **Portal do Desenvolvedor PagBank**. É normal essa tela mostrar somente e-mail e token. A aplicação Connect, o `client_id`, o `client_secret` e o `account_id` não são criados por um botão nessa tela; a aplicação é criada por uma chamada à API oficial.

| Dado | O que é | Como obter |
|---|---|---|
| Token Sandbox | autentica a conta/plataforma no Sandbox | Portal do Desenvolvedor → Tokens |
| `account_id` | identifica uma conta que recebe valores; começa com `ACCO_` | criação da aplicação e/ou conta autorizada |
| `client_id` | identifica a aplicação Connect do SmartBus | resposta de `POST /oauth2/application` |
| `client_secret` | segredo privado da aplicação | deve ser entregue na criação; guarde a resposta completa |
| `access_token` | permite agir em nome de uma empresa vendedora | empresa autoriza via Connect; SmartBus troca o código recebido |
| `refresh_token` | renova a autorização da empresa | resposta da troca de token Connect |

**Não acrescente `ACCO_` ao token.** Um token nunca vira um `account_id`.

## Próxima ação correta

1. Troque o token que já foi exposto em conversa/imagem.
2. Defina o callback HTTPS real do SmartBus.
3. Crie uma única aplicação Connect do SmartBus no Sandbox:

```http
POST https://sandbox.api.pagseguro.com/oauth2/application
Authorization: Bearer SEU_TOKEN_SANDBOX_NOVO
Content-Type: application/json
```

Corpo conceitual:

```json
{
  "name": "SmartBus",
  "description": "Plataforma de venda de passagens e gestão de transporte",
  "site": "https://www.smartbus.com.br",
  "redirect_uri": "URL_HTTPS_EXATA_DO_CALLBACK_PAGBANK_NO_SUPABASE",
  "logo": "URL_PUBLICA_DO_LOGO_SMARTBUS"
}
```

4. Guarde toda a resposta exclusivamente no cofre de segredos do backend.
5. Confira se vieram `client_id`, `client_secret` e `account_id`. A documentação oficial é inconsistente ao exibir a resposta; se faltar `client_secret`, não invente nem use outro serviço: abra chamado no PagBank com request/response redigidos.
6. Depois conecte uma conta Sandbox separada da empresa vendedora usando o Connect Authorization.
7. Só então faça o primeiro PIX com split e confira a consulta retornada.

## Preciso entrar na conta PagBank normal?

- **Para testar agora:** não. Use o Portal do Desenvolvedor e a API Sandbox.
- **Para Produção depois:** sim. A conta PagBank desktop fornece o token de Produção em Vendas → Integrações e o Identificador para marketplace em Vendas → Plataformas e Checkout. Produção depende de homologação.
- Não misture um `account_id` de Produção com o token/endpoint Sandbox; isso pode resultar em `account_not_found`.

## Preciso da PB Integrações?

Não. Ela oferece uma Connect Key e uma camada intermediária própria. O próprio site informa que suas integrações não são criadas pelo PagBank/PagSeguro. Usá-la mudaria a arquitetura escolhida e não é necessário para chamar `sandbox.api.pagseguro.com` ou `api.pagseguro.com` diretamente.

## O mínimo para o primeiro teste de split

- token Sandbox novo da plataforma, no cofre;
- aplicação SmartBus criada (`client_id`, `client_secret`, `account_id`);
- callback OAuth público e estável;
- uma conta Sandbox da empresa vendedora autorizada via Connect;
- `account_id` distintos e válidos para Marketplace e empresa;
- split habilitado/aceito pelo PagBank no Sandbox;
- URL de webhook enviada em `notification_urls` no pedido;
- cobrança PIX criada e consultada, com recebedores e centavos conferidos.

## Fontes oficiais

- [Token de autenticação](https://developer.pagbank.com.br/docs/token-de-autenticacao)
- [Crie sua conta PagBank](https://developer.pagbank.com.br/docs/crie-sua-conta-pagbank)
- [Criar aplicação](https://developer.pagbank.com.br/reference/criar-aplicacao)
- [Connect](https://developer.pagbank.com.br/docs/connect)
- [Connect Authorization](https://developer.pagbank.com.br/docs/connect-authorization)
- [Obter access token](https://developer.pagbank.com.br/reference/obter-access-token)
- [Split com PIX](https://developer.pagbank.com.br/reference/pedido-com-divisao-de-pagamento-com-pix)
- [Solicitar homologação](https://developer.pagbank.com.br/docs/solicitar-homologacao)

**Nota:** a criação da aplicação é uma operação externa. Faça-a somente com token novo e não cole credenciais no chat, no GitHub ou em documentação.
