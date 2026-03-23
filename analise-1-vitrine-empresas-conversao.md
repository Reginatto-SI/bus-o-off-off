# Análise da vitrine pública das empresas — conversão

## Resumo executivo
- A vitrine pública da empresa já possuía uma base funcional consistente, com hero, carrossel, listagem de eventos, parceiros, patrocinadores e bloco de confiança.
- O maior problema identificado era de **hierarquia comercial**: a página informava, mas vendia pouco no topo, com copy genérica e destaque principal ainda mais visual do que comercial.
- A correção aplicada foi incremental e conservadora: fortalecimento do hero, melhoria da comunicação do destaque principal, refinamento dos cards e evolução do bloco de confiança, sem alterar regras de negócio, checkout, rotas ou fluxo de pagamento.

## Diagnóstico visual e de produto

### 1. Hero principal
- O hero já mostrava logo, nome da empresa e CTAs, mas a mensagem central era genérica.
- Faltava deixar explícito que a página vende **passagens para eventos, excursões e viagens organizadas**.
- O CTA principal existia, porém podia ter mais contexto comercial e conexão com a decisão do usuário leigo.

### 2. Evento em destaque / banner principal
- O destaque principal tinha boa presença visual, mas ainda podia ser percebido como banner estático.
- O bloco precisava reforçar leitura de valor, ação e sensação de “posso comprar agora”.
- Havia oportunidade clara de melhorar contraste, rótulo comercial e microcopy de decisão.

### 3. Cards da listagem de eventos
- Os cards estavam organizados, porém com foco maior em estrutura do que em conversão.
- Faltava uma camada curta de contexto comercial para ajudar o usuário a entender rapidamente o que está comprando.
- O botão principal podia comunicar melhor o próximo passo.

### 4. Hierarquia da página
- A página tinha os blocos corretos, mas com pesos visuais próximos.
- O fluxo comercial não destacava com tanta clareza a sequência: proposta → destaque → comparação de opções → reforço de confiança.

### 5. Bloco “Por que viajar com a gente?”
- O bloco já contribuía para confiança, mas ainda soava mais funcional do que comercial.
- A seção precisava contextualizar melhor o valor percebido para o passageiro final.

### 6. Prova social / confiança
- Não havia dados inventados, o que está correto.
- Faltavam reforços legítimos de confiança com base em operação, suporte, embarque claro e compra segura.

### 7. Clareza comercial
- A comunicação geral ainda podia ficar genérica para um usuário leigo.
- Foi necessário reforçar que se trata de **viagens organizadas para eventos com compra online e embarque orientado**.

## Problemas encontrados
1. Copy do hero pouco vendedora para a função comercial da vitrine.
2. CTA principal correto, porém com espaço para ganhar mais contexto de compra.
3. Destaque principal com boa imagem, mas sem rótulo comercial e com oportunidade de CTA mais forte.
4. Cards com preço e ação visíveis, porém com pouco apoio textual de decisão.
5. Seção “Todos os eventos” sem introdução curta para orientar comparação de opções.
6. Bloco de confiança com valor percebido abaixo do potencial.

## Oportunidades de melhoria
- Reforçar proposta de valor e clareza comercial no topo.
- Inserir selos curtos de confiança no hero sem inventar métricas.
- Tornar o destaque principal mais vendedor mantendo o componente atual.
- Melhorar a leitura dos cards com benefício curto e CTA mais explícito.
- Criar melhor transição entre destaque, listagem e confiança com subtítulos objetivos.
- Aumentar percepção de segurança e profissionalismo com copy legítima e layout já compatível com o projeto.

## Arquivos/componentes afetados
- `analise-1-vitrine-empresas-conversao.md`
- `src/pages/public/PublicCompanyShowcase.tsx`
- `src/components/public/EventCardFeatured.tsx`
- `src/components/public/EventCard.tsx`

## Plano de correção mínima
1. Fortalecer o hero com mensagem mais clara, selos de confiança e CTA principal mais coerente com a vitrine.
2. Melhorar o bloco de destaque principal com mais contraste, rótulo comercial e CTA mais acionável.
3. Ajustar cards de eventos com contexto comercial curto e botão mais claro.
4. Reforçar a hierarquia da página com subtítulos breves e bloco de confiança mais intencional.
5. Validar build, testes e impacto visual sem alterar regras de negócio.

## Implementação realizada
- Hero ajustado com copy mais clara sobre passagens para eventos, excursões e viagens organizadas.
- Inclusão de selos curtos de confiança no hero: passagens para eventos, embarque organizado, compra segura e atendimento rápido quando houver WhatsApp cadastrado.
- CTA principal do hero alterado de “Ver eventos disponíveis” para “Ver viagens disponíveis”, aproximando a linguagem do objetivo comercial.
- Seção do carrossel passou a ter subtítulo comercial e indicador simples de quantidade de eventos disponíveis.
- Banner principal recebeu rótulo “Evento em destaque”, overlay mais forte, microcopy de apoio e CTA “Comprar agora”.
- Cards passaram a exibir contexto curto de compra/embarque, descrição breve de decisão e CTA “Ver detalhes e comprar”.
- Seção “Todos os eventos” ganhou texto de apoio para ajudar a comparação de opções.
- Bloco “Por que viajar com a gente?” foi reorganizado com cabeçalho mais comercial, texto explicativo e benefícios reescritos para maior clareza percebida.

## Validações finais
- **Rota/página/componente alterado:** vitrine pública da empresa em `src/pages/public/PublicCompanyShowcase.tsx`, além dos componentes `src/components/public/EventCardFeatured.tsx` e `src/components/public/EventCard.tsx`.
- **Hero ficou mais claro:** sim, com proposta de valor mais explícita e reforços visuais de confiança.
- **Destaque principal ficou mais clicável e vendedor:** sim, com rótulo comercial, contraste mais forte, microcopy e CTA mais direto.
- **Cards ficaram mais legíveis:** sim, com melhor apoio textual e CTA mais claro.
- **Página ganhou melhor hierarquia:** sim, com separação mais clara entre destaque, listagem e confiança.
- **Blocos de confiança ficaram melhores:** sim, com texto mais contextualizado e benefícios mais orientados ao usuário final.
- **Nenhuma regra de negócio foi alterada:** confirmado.
- **Não houve criação de fluxo paralelo:** confirmado.
- **Mudança consistente com o padrão do projeto:** confirmado, com reutilização dos mesmos componentes-base e ajustes incrementais de UI/copy.
