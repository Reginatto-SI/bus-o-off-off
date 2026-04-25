# Análise 28 — seção como começar na landing

## Objetivo

Adicionar uma nova seção na landing page pública do Smartbus BR para mostrar, de forma comercial, simples e visual, como uma empresa começa a vender passagens usando a plataforma.

## Estratégia adotada

- Fazer a menor alteração possível diretamente em `src/pages/public/LandingPage.tsx`.
- Reutilizar o padrão visual já existente da landing: seção com heading centralizado, cards com borda arredondada, ícones Lucide já importados no arquivo e CTA primário com o mesmo estilo já usado em outros blocos.
- Evitar linguagem técnica e posicionar a nova seção como apoio comercial à conversão, e não como tutorial operacional.

## Arquivos alterados

- `src/pages/public/LandingPage.tsx`
- `analise-28-secao-como-comecar-landing.md`

## Decisão de posicionamento

A nova seção foi inserida imediatamente antes da FAQ existente. Essa posição mantém a ordem comercial desejada:

1. proposta de valor e benefícios
2. reforços de credibilidade e diferenciais
3. explicação rápida de como começar
4. FAQ para responder objeções finais

Essa escolha ajuda o visitante a entender que começar é simples antes de entrar no bloco de perguntas frequentes.

## Estrutura final dos passos

1. **Cadastre seu evento**  
   Crie o evento que será vendido na sua vitrine e apresente sua próxima saída com clareza.

2. **Defina locais e horários de embarque**  
   Organize os pontos de saída de forma clara para o passageiro saber onde e quando embarcar.

3. **Conecte sua conta de recebimento**  
   Vincule sua conta Asaas para receber os pagamentos de forma simples e organizada.

4. **Publique e compartilhe o link**  
   Divulgue sua página de vendas no WhatsApp, nas redes sociais ou no seu próprio site.

5. **Comece a vender passagens**  
   Acompanhe sua operação e suas vendas em um só lugar, com mais visibilidade para crescer.

## Validações realizadas

- Verificação da posição atual da FAQ na landing para inserir a nova seção antes dela.
- Reuso do estilo visual já adotado na própria landing para headings, cards e botões.
- Validação por build para confirmar que a alteração compila sem quebrar a aplicação.
- Revisão da responsividade pelo próprio layout em grid:
  - mobile: cards empilhados
  - tablet: 2 colunas
  - desktop largo: 5 colunas

## Observações de manutenção

- Foram adicionados comentários curtos no código para facilitar suporte futuro.
- Nenhuma lógica de login, pagamentos ou integração Asaas foi alterada.
