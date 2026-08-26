---
name: web-app-update-notifier
description: Use when users remain on an old web-app version after deployment, an open application must detect a newly published version, or users need a controlled update prompt that preserves session and work in progress. Applies to conventional web apps, existing PWAs, and projects with their own version, cache, or update mechanism. Adapt to the architecture already present; do not use this skill to turn a conventional app into a PWA solely to add update notifications.
---

# Web App Update Notifier

Implementar o menor fluxo confiável para detectar divergência entre a versão executada e a publicada, avisar o usuário e atualizar somente após confirmação.

## Regras

- Investigar antes de alterar; não presumir framework, hospedagem, pipeline, polling, PWA, service worker, cache ou autenticação.
- Reutilizar componentes, serviços, eventos, versionamento, pipeline e testes existentes. Não criar mecanismo concorrente ou arquitetura paralela.
- Fazer mudanças mínimas e não adicionar dependências sem necessidade comprovada.
- Pedir confirmação antes de recarregar e permitir que operações críticas ou formulários com alterações pendentes cancelem a atualização.
- Preservar autenticação, sessão e dados. Não executar logout nem limpar indiscriminadamente `localStorage`, `sessionStorage`, IndexedDB, cookies, Cache Storage ou registros de service worker.
- Não converter uma aplicação convencional em PWA e não alterar deploy, CDN ou headers sem evidência e escopo explícito.
- Validar dados de versão e usá-los somente para comparação/cache-busting; nunca executar código, injetar HTML ou aceitar redirecionamento arbitrário a partir deles.
- Falhar sem bloquear, recarregar ou inutilizar a aplicação. Não expor detalhes internos de build ao usuário final.

## Fluxo

### 1. Auditar

Localizar e seguir até o efeito final:

1. entrada e shell global da aplicação, design system e padrões de estado;
2. build/deploy e eventual identificador da versão executada;
3. fonte da versão publicada, formato, origem e política de cache;
4. gatilhos de checagem: carga, intervalo, foco, reconexão, ação manual ou evento de worker;
5. aviso atual e ações de atualizar/adiar;
6. efeito da confirmação: proteção de dados, ativação de worker, invalidação de cache e navegação;
7. persistência de sessão e dados críticos;
8. manifest, registro/ciclo de service worker e caches, se existirem;
9. tratamento de concorrência, erro, offline, rollback, múltiplas abas e loops;
10. testes e limitações reais do deploy.

Se já existir mecanismo de atualização, completar apenas a lacuna comprovada. Perguntar antes de mudar contratos de persistência, UX ou deploy.

### 2. Escolher um único cenário

**Web convencional:** preferir um identificador estável por build, embutido no bundle como versão executada e publicado em referência pequena de mesma origem como versão disponível. Produzir ambos no mesmo artefato. Consultar apenas essa referência sem cache obsoleto; não limpar armazenamento global.

**PWA já existente:** integrar ao ciclo do worker existente. Detectar o worker aguardando, pedir confirmação, ativá-lo pelo protocolo suportado, aguardar `controllerchange` uma única vez e recarregar. Invalidar somente caches controlados pela aplicação e versão anterior; não remover todos os workers ou caches da origem.

**Mecanismo próprio:** preservar sua fonte, comparação, canal de eventos e rotina de atualização. Não adicionar polling ou fluxo PWA em paralelo.

Implementar somente o cenário encontrado.

### 3. Definir o contrato de versão

- Usar valor constante dentro da build e diferente entre publicações, reaproveitando ID de pipeline, hash de artefato ou timestamp confiável já disponível.
- Manter versão embutida e publicada sincronizadas no mesmo deploy.
- Comparar por igualdade, salvo se houver ordenação formal e testada. Identificadores diferentes indicam artefatos divergentes, inclusive em rollback; não presumir que o valor remoto é numericamente maior.
- Validar status HTTP, tipo, presença, tamanho e formato. Ignorar resposta ausente ou inválida.
- Não usar uma versão de pacote que permaneça igual entre deploys.
- Considerar publicação não atômica: só avisar quando metadado, documento e assets estiverem consistentes, ou repetir a confirmação antes de atualizar.

### 4. Detectar

- Manter uma única fonte de estado compartilhada e impedir requisições simultâneas.
- Verificar sem bloquear a inicialização e repetir por um gatilho compatível com o projeto; polling é opção, não requisito.
- Reutilizar a mesma checagem para foco, reconexão ou ação manual quando esses gatilhos forem necessários.
- Cancelar timers, requests e listeners ao desmontar.
- Não tratar uma checagem ignorada, abortada ou falha como “atualizado”. Aplicar timeout/abort se o padrão de rede existente oferecer suporte.
- Em erro, manter a aplicação operante e registrar diagnóstico sem dados sensíveis.

### 5. Avisar e proteger o usuário

- Montar o aviso no shell existente e reutilizar o padrão visual do projeto; não impor design.
- Informar apenas que existe uma nova versão e que a ação aplicará melhorias. Oferecer ação clara para atualizar e, se adequado, adiar.
- Antes da atualização, reutilizar a proteção central de trabalho não salvo. Parar se qualquer operação cancelar.
- Se houver “Depois”, associar a dispensa à versão detectada, escolher conscientemente o escopo (memória, aba ou navegador) e garantir que outra versão volte a aparecer.
- Não salvar rascunhos sensíveis nem criar persistência nova sem requisito e análise de segurança.

### 6. Aplicar

Após confirmação:

1. revalidar a versão alvo;
2. consultar proteções de operação/trabalho pendente;
3. executar a estratégia escolhida de worker ou navegação;
4. invalidar somente assets/caches comprovadamente controlados pela aplicação, quando necessário;
5. preservar rota e parâmetros, alterando apenas cache-busting de origem e formato controlados;
6. executar reload/replace uma única vez;
7. após carregar, confirmar que a versão embutida corresponde à publicada.

Não limpar o armazenamento da autenticação. Confirmar no código onde a sessão persiste e permitir que o cliente a restaure. Se a sessão existir somente em memória, documentar a limitação ou pedir autorização antes de alterar sua persistência.

### 7. Evitar loops e conflitos

- Encerrar o fluxo quando versão executada e publicada coincidirem.
- Nunca recarregar por erro, offline ou payload vazio.
- Usar trava contra confirmações/reloads duplicados e listeners de execução única.
- Se CDN/deploy continuar entregando o bundle antigo, registrar uma tentativa por versão e voltar ao aviso/fallback controlado; não recarregar automaticamente em ciclo.
- Coordenar múltiplas abas somente quando relevante, preferindo mecanismo já existente. Não adicionar `BroadcastChannel` ou eventos de storage preventivamente.

## Validação

Testar, conforme aplicável:

- versão atual sem aviso;
- nova publicação com aplicação aberta, detecção e aviso;
- atualização somente após confirmação e adiamento sem interrupção;
- bundle novo efetivamente carregado e versão convergente;
- sessão, contexto válido e dados preservados;
- operação/formulário pendente cancelando a atualização;
- falha HTTP, timeout, offline e payload inválido sem quebra/reload;
- refresh após deploy e CDN ainda servindo bundle antigo sem loop;
- rollback tratado como divergência, sem ordenação presumida;
- múltiplas abas sem ação destrutiva, quando relevante;
- cache antigo liberado sem apagar dados ou caches não relacionados;
- em PWA, worker aguardando, ativação, `controllerchange`, cache versionado e modo offline.

Preferir testes unitários para contrato/comparação, testes de componente para aviso/confirmação e teste E2E/preview com duas builds para comprovar a troca. Inspecionar rede e armazenamento quando possível.

## Entrega

Informar mecanismo encontrado e escolhido, arquivos alterados, preservação de sessão/dados, tratamento de cache/PWA, proteções contra erro/loop, testes, limitações e riscos de atomicidade/CDN. Não declarar sucesso apenas porque houve reload; comprovar a versão carregada.
