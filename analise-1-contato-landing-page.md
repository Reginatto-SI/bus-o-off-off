# Análise 1 — contato landing page

## Objetivo da alteração
Adicionar uma opção de contato secundária e discreta na landing page pública do Smartbus BR, abrindo um modal leve com formulário simples, sem competir com o CTA principal de conversão.

## Arquivos analisados
- `src/pages/public/LandingPage.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/public/FloatingWhatsApp.tsx`
- `src/integrations/supabase/client.ts`
- `package.json`

## Componentes reutilizados
- `Dialog`, `DialogContent`, `DialogDescription`, `DialogHeader`, `DialogTitle`, `DialogTrigger`
- `Button`
- `Input`
- `Label`
- `Textarea`
- utilitário `buildWhatsappWaMeLink`

## Decisão tomada para envio do formulário
Não foi encontrado no escopo público da landing um endpoint dedicado de contato, Edge Function de lead, webhook de captura comercial ou integração de e-mail já pronta para reaproveitamento.

Para manter a alteração mínima, segura e previsível, o envio do formulário foi implementado reutilizando o canal comercial já existente da landing: o WhatsApp institucional configurado no próprio projeto. O formulário coleta nome, e-mail, telefone/WhatsApp e mensagem e, ao enviar, abre o WhatsApp com a mensagem estruturada e pronta para envio.

Também foi mantido um link de e-mail visível como apoio secundário.

## O que foi implementado
- link/botão discreto de contato na área final da landing
- ponto secundário de acesso no rodapé
- modal com campos:
  - nome
  - e-mail
  - telefone ou WhatsApp
  - mensagem
- validação básica no cliente para evitar envio vazio
- reaproveitamento do `Dialog` já existente no projeto
- reaproveitamento do WhatsApp comercial já usado pela landing

## O que não foi implementado
- novo backend de leads
- nova tabela no banco
- Edge Function de contato
- integração de e-mail transacional
- CRM, chatbot ou central de suporte

## Possíveis pendências
- confirmar se `comercial@smartbusbr.com.br` é o e-mail institucional correto para manter no link de apoio
- se o time quiser persistência de leads no futuro, definir um fluxo único oficial antes de criar endpoint ou tabela

## Riscos ou observações
- como o envio atual depende da abertura do WhatsApp no navegador/dispositivo do usuário, a captura não fica persistida automaticamente no banco
- a solução foi escolhida por ser a opção mínima e segura encontrada dentro da infraestrutura já existente no projeto
- caso seja necessário rastreamento de leads no futuro, vale evoluir com uma integração única oficial, sem criar fluxo paralelo
