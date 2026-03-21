# Objetivo da alteração
Melhorar a landing page pública principal do Smartbus BR para aumentar conversão, clareza comercial e posicionamento para empresas e vendedores independentes, preservando o padrão visual existente.

# Arquivos localizados
- `src/pages/public/LandingPage.tsx`
- `src/components/public/FloatingWhatsApp.tsx`
- `src/lib/whatsapp.ts` (reutilizado, sem alteração)

# Diagnóstico resumido da landing anterior
- A headline principal estava mais descritiva do que comercial.
- A comunicação favorecia mais empresas do que vendedores independentes.
- Havia texto com cara de anotação interna no bloco de diferenciais.
- Alguns CTAs ainda estavam genéricos ou pouco orientados à conversão.
- O WhatsApp comercial da landing estava com número antigo.

# Decisões tomadas
- Reaproveitar a estrutura já existente da landing, ajustando apenas a copy, alguns CTAs e a hierarquia de seções.
- Inserir uma seção intermediária para explicitar a dualidade “empresas + vendedores independentes” sem criar novos componentes.
- Reutilizar o helper `buildWhatsappWaMeLink` para padronizar o link comercial do WhatsApp.
- Adicionar comentários curtos no código nos pontos estratégicos alterados.

# Lista das mudanças realizadas
- Reescrita da headline, subtítulo e selos do hero com foco em venda online, embarque e crescimento com simplicidade.
- Reforço da copy dos pilares e diferenciais com linguagem comercial e orientada a benefício.
- Remoção da frase de bastidor no bloco “Diferenciais que mostram a força real do produto”.
- Inclusão de uma seção específica para comunicar valor para empresas e vendedores independentes.
- Fortalecimento dos CTAs para compra, cadastro e contato comercial.
- Atualização do botão flutuante do WhatsApp e do CTA final para o número `(31) 99207-4309` com mensagem pré-preenchida.

# Eventuais pontos de atenção
- A landing continua usando dados mockados de vitrine; a alteração foi apenas de posicionamento e copy.
- O CTA secundário final agora direciona para o WhatsApp comercial, o que muda a intenção do clique sem alterar layout.
- Não foram feitas alterações em outras telas públicas, checkout, painel administrativo ou fluxos internos.

# Validação final do que foi conferido
- Headline principal mais forte e comercial.
- Linguagem interna removida do bloco destacado pelo usuário.
- Comunicação explícita para empresa e vendedor independente.
- CTAs mais comerciais e coerentes com o visual atual.
- WhatsApp atualizado sem resquício do número anterior nos pontos alterados da landing.
- Mudanças restritas à landing pública principal e ao botão flutuante reutilizado nela.
- Comentários adicionados nos trechos estratégicos alterados.
