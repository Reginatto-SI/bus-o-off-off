# Análise 02 — Imagens dos eventos da landing

## Contexto
A vitrine da landing estava com associação de imagens por posição (índice) e, depois, ainda havia reutilização de arquivos entre cards diferentes.

## Antes x Depois (associação imagem ↔ evento)

| Evento | Antes | Depois (exclusivo e explícito) |
|---|---|---|
| Excursão para Pratigi | `/landingpage/eventos_img/praia.jpg` | `/landingpage/eventos_img/pratigi.jpg` |
| Viagem para Morro de São Paulo | `/landingpage/eventos_img/estrada.jpg` | `/landingpage/eventos_img/morro-sao-paulo.jpg` |
| Excursão para Salvador | `/landingpage/eventos_img/cidade.jpg` | `/landingpage/eventos_img/salvador.jpg` |
| Evento na Praia | `/landingpage/eventos_img/praia.jpg` | `/landingpage/eventos_img/evento-praia.jpg` |
| Evento Regional | `/landingpage/eventos_img/cidade.jpg` | `/landingpage/eventos_img/evento-regional.jpg` |
| Festival Cultural | `/landingpage/eventos_img/festival.jpg` | `/landingpage/eventos_img/festival-cultural.jpg` |

## Confirmações
- Continua sem lógica por índice para imagem.
- Cada objeto de `FEATURED_TRIPS` define o próprio `image`.
- Não há reutilização de imagem entre cards diferentes.

## Validação de coerência visual
- Pratigi usa imagem específica de Pratigi.
- Morro de São Paulo usa imagem específica do destino.
- Salvador usa imagem específica da cidade.
- Evento na Praia usa imagem específica de evento de praia.
- Evento Regional usa imagem específica regional.
- Festival Cultural usa imagem específica cultural.

## Impacto
- Mudança mínima e localizada, sem alterar layout/estrutura/componentes.
- Associação clara, auditável e previsível para manutenção.


## Estrutura de arquivos criada
- Pasta criada: `public/landingpage/eventos_img/`.
- Mantido apenas o caminho (sem JPEG no Git) para evitar erro de PR com binários.
- Guia de substituição e nomes esperados em: `public/landingpage/eventos_img/README.md`.
