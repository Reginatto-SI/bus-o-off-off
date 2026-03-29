# Análise 5 — Validação orientativa no upload de banner

## 1. O que foi implementado
Foi adicionada validação **orientativa (não bloqueante)** no upload de banner em `/admin/eventos`.

Ao selecionar a imagem, o frontend agora verifica proporção e resolução para orientar o usuário quando o arquivo estiver fora do recomendado, sem impedir upload/salvamento.

---

## 2. Como a validação funciona
Critérios aplicados no frontend, antes da persistência:

1. **Proporção recomendada:** 16:9 (com pequena tolerância)
2. **Resolução recomendada mínima:** 1280×720

Comportamento:
- se estiver dentro do recomendado → segue sem aviso
- se estiver fora → exibe aviso amigável contextual
- em qualquer cenário → upload continua normalmente (sem bloqueio)

Mensagens orientativas cobrem:
- proporção fora do ideal
- resolução abaixo do ideal
- ambos os casos simultâneos

---

## 3. Onde o aviso aparece
O aviso aparece na própria área de banner da aba **Geral** no modal de evento, logo abaixo do bloco de upload/preview, usando um `Alert` leve e não crítico.

Assim, a orientação fica visível no contexto correto, sem poluir o restante do formulário.

---

## 4. Arquivos alterados
- `src/pages/admin/Events.tsx`
- `analise-5-validacao-orientativa-banner-upload.md`

---

## 5. Observações
- Não houve alteração de backend, storage, `image_url` ou regras de upload.
- A validação usa leitura de dimensões no cliente (`Image` + `URL.createObjectURL`) e descarta a URL temporária após análise.
- O estado do aviso é limpo ao resetar o formulário e ao remover a imagem.
