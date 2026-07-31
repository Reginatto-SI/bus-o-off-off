# Ajuste mínimo da câmera e domínio oficial

**Data:** 31/07/2026  
**Referência:** `docs/Analises/analise-camera-webview-selecao-dispositivo.md`.

## Resumo

A implementação foi reduzida ao tratamento comprovadamente necessário: logo após `getUserMedia()`, o frontend verifica se o stream está ativo, se há uma track de vídeo e se ela permanece `live`. Stream inativo, track ausente ou track encerrada recebe o código interno `camera_track_ended_immediately`, não é associado ao `<video>`, tem suas tracks paradas pelo cleanup existente e libera a fila serial para o próximo candidato.

Não são usados `enabled` ou `muted` como evidência de falha nativa. Ordem, enumeração, constraints, intervalo de 800 ms, retries, preferência opaca por `deviceId`, scanner, `jsQR` e `BarcodeDetector` permanecem inalterados. A preferência continua sendo removida pelo callback já existente quando o candidato preferido falha.

## Arquivos mantidos no diff

* `src/pages/driver/DriverValidate.tsx`: validação imediata, descarte e mensagem simples.
* `src/pages/driver/DriverValidate.test.ts`: testes focados no retorno imediato e nos contratos seriais/preferência já existentes.
* `index.html`: somente a correção estática do JSON-LD para `https://www.smartbus.com.br`.
* este resumo curto.

## Alterações revertidas

Foram revertidas integralmente as alterações anteriores em:

* `supabase/functions/_shared/auth-email-resend.ts`;
* `supabase/functions/admin-user-auth-support/index.ts`;
* `supabase/functions/auth-email-hook/index.ts`;
* `supabase/functions/create-user/index.ts`;
* `src/lib/companyDomainRouting.test.ts`;
* `src/test/officialDomainMetadata.test.ts` (removido).

Também foram removidos da implementação de câmera: interceptação global de `MediaStreamTrack.prototype.stop`, listeners diagnósticos adicionais de lifecycle/rota/mute/unmute, `WeakMap` de listeners, `getCapabilities()` adicional, duração por tentativa, mensagens e tipos de erro excessivos e particionamento novo da preferência por origem. O diagnóstico `cameraDebug=1` permanece local e registra somente tentativa/constraint, snapshot imediato, descarte e motivo do `stop()` executado pelo SmartBus.

## Mensagem e comportamento

Quando todas as tentativas retornam uma track terminal, a tela informa: “A câmera foi aberta, mas o vídeo foi interrompido pelo dispositivo. Feche outros aplicativos que estejam usando a câmera e tente novamente.” No WebView, acrescenta apenas o fallback operacional de reabrir o aplicativo ou usar temporariamente o Chrome.

Uma track válida segue pelo mesmo caminho do Chrome: associação em `srcObject`, metadata, `play()`, primeiro quadro e scanner. Não há seleção por índice, ID Camera2 literal, label numérico, resolução forçada ou retry adicional.

## Proteções de escopo

Nenhum arquivo Asaas/pagamento, checkout, webhook, split, wallet, migration, RLS, secret ou configuração de ambiente foi alterado. As duas falhas preexistentes de `asaasIntegrationStatus` permanecem apenas documentadas. Nenhuma Edge Function de autenticação permanece no diff.

O redirect ainda observado de `smartbus.com.br` para `smartbusbr.com.br` é pendência da infraestrutura externa; o frontend não tenta compensá-lo. O wrapper Android continua ausente deste repositório e deve ser analisado no repositório próprio.

## Testes

Os testes mínimos cobrem track `ended`, stream inativo, track ausente, track `live` mesmo muted/disabled, descarte com avanço serial, ausência de concorrência, remoção da preferência preferida e ausência de índice/ID nativo literal. O build e o resultado final dos comandos são registrados na descrição da entrega.
