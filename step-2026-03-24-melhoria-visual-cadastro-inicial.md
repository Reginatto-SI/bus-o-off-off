# Step 2026-03-24 — Melhoria visual da tela inicial de cadastro (/cadastro)

## Objetivo
Elevar de forma perceptível o acabamento visual e a força comercial da tela inicial de cadastro de empresa/vendedor, aproximando a experiência da linguagem premium já presente na landing page pública do Smartbus BR, sem alterar regras de negócio, fluxos funcionais ou integrações.

## Diagnóstico visual encontrado
- A composição anterior priorizava o formulário puro e deixava a lateral institucional com baixo impacto visual.
- Havia pouca hierarquia entre promessa de valor, conteúdo de confiança e CTA principal.
- O formulário era funcional, mas com sensação de bloco cru (baixo contraste entre seções e pouca profundidade visual).
- O CTA estava correto funcionalmente, porém sem o destaque comercial esperado para uma tela de conversão.

## Decisões de UI aplicadas
1. **Reforço da composição geral desktop**
   - Grid com melhor balanço entre bloco institucional e bloco de formulário.
   - Fundo sutil com gradiente/radial para percepção de produto mais maduro, sem poluição.

2. **Lado institucional mais persuasivo**
   - Card escuro premium com contraste alto e melhor presença visual.
   - Benefícios em subcards com título + descrição objetiva (controle operacional, gestão de eventos, QR Code, comissão e pagamentos online).
   - Mensagem de confiança de ativação gratuita no final da lateral.

3. **Hero/formulário com hierarquia comercial**
   - Inclusão de badges de “Cadastro gratuito” e “Ambiente seguro”.
   - Título e subtítulo com melhor escaneabilidade.
   - Separação visual do cabeçalho do formulário com borda inferior.

4. **Melhoria de ergonomia do formulário**
   - Aumento de respiro entre grupos de campos.
   - Altura de campos padronizada para leitura/edição mais confortável.
   - Bloco de tipo de cadastro com destaque visual de seleção PF/PJ.

5. **CTA e confiança**
   - CTA com maior presença (altura, peso tipográfico e sombra suave).
   - Área de confiança com bullets claros: sem cartão, sem cobrança inicial e dados protegidos.

## O que foi alterado
- **Apenas UI/UX visual da página `src/pages/public/CompanyRegistration.tsx`**.
- Textos institucionais/microcopy ajustados para reforço comercial e clareza.
- Classes de layout, espaçamento, contraste, borda, sombra e profundidade revisadas.
- Comentários adicionados no código para orientar manutenção futura.

## O que não foi alterado
- Nenhuma regra de negócio do cadastro.
- Nenhuma validação funcional PF/PJ.
- Nenhum fluxo de autenticação/login automático.
- Nenhuma integração backend/supabase function (`register-company`).
- Nenhuma regra de referral tracking.
- Nenhuma estrutura de multiempresa, pagamento ou ambientes.

## Checklist final de validação
- [x] Desktop com melhoria visual perceptível e hierarquia mais forte.
- [x] Responsividade básica mantida (sem quebra de mobile).
- [x] Contraste e legibilidade reforçados.
- [x] Espaçamento entre blocos e campos revisado.
- [x] CTA principal com maior destaque visual.
- [x] Consistência visual com proposta da landing (sem copiar literalmente).
- [x] Lógica funcional preservada.
- [x] Sem alteração de regras PF/PJ.
- [x] Estados visuais do formulário preservados (erro, loading, alerta de indicação).
