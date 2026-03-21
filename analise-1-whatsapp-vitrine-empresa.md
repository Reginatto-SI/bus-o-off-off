# 1. Resumo do problema

A vitrine pública da empresa estava misturando contextos de contato. O botão principal do hero dependia do `whatsapp` vindo da query de eventos, enquanto o botão flutuante reutilizava o componente global da landing institucional com número hardcoded do Smartbus BR. Na prática, isso permitia que a vitrine abrisse o WhatsApp institucional da plataforma em vez do WhatsApp cadastrado na empresa atual.

# 2. Causa real encontrada no código

A causa principal estava em dois pontos combinados:

1. `src/components/public/FloatingWhatsApp.tsx` continha um telefone fixo da landing institucional e era renderizado por padrão em `src/components/layout/PublicLayout.tsx`.
2. `src/pages/public/PublicCompanyShowcase.tsx` montava o CTA do hero lendo `events[0]?.company?.whatsapp`, criando dependência da carga de eventos em vez de consumir diretamente o cadastro público da empresa da vitrine.

# 3. Origem antiga do link de WhatsApp

- **Botão flutuante da vitrine:** contato institucional/global hardcoded da landing.
- **CTA do hero da vitrine:** `events[0]?.company?.whatsapp`, vindo da lista de eventos e não do registro principal da empresa carregado pela vitrine.

# 4. Origem correta implementada

A vitrine pública agora usa `companies.whatsapp` do cadastro da própria empresa carregada pelo `public_slug`. Esse dado é selecionado explicitamente na consulta da vitrine e transformado em link `wa.me` por meio do helper existente `buildWhatsappWaMeLink`.

# 5. Componentes/arquivos ajustados

- `src/components/public/FloatingWhatsApp.tsx`
- `src/components/layout/PublicLayout.tsx`
- `src/pages/public/PublicCompanyShowcase.tsx`

# 6. Regras aplicadas para ausência de WhatsApp cadastrado

Quando a empresa não possui `whatsapp` válido:

- o botão principal de WhatsApp do hero não é exibido;
- o botão flutuante da vitrine também não é exibido;
- não existe fallback para o número institucional da landing dentro da vitrine.

A landing institucional continua podendo usar o componente com o contato comercial padrão, porque nela o `href` não é sobrescrito.

# 7. Riscos evitados com a correção

- envio de leads da empresa para o WhatsApp institucional da plataforma;
- mistura indevida entre contexto multiempresa e landing institucional;
- CTA da vitrine depender da existência de eventos para conseguir exibir o contato da empresa;
- fallback silencioso para contato global em um fluxo comercial que precisa ser por empresa.

# 8. Resultado final esperado

Ao acessar `/empresa/:slug`:

- o CTA principal do hero abre conversa com o WhatsApp cadastrado da empresa atual;
- o botão flutuante da vitrine usa o mesmo WhatsApp da empresa atual;
- se a empresa não tiver WhatsApp cadastrado, esses CTAs deixam de aparecer com segurança;
- a landing institucional segue separada, mantendo o contato global apenas no contexto da própria landing.
