

## Plano: Adicionar botão "Copiar log" no painel debug

### Alteração única em `src/pages/driver/DriverValidate.tsx`

Adicionar um botão dentro do `<details>` do debug panel que:

1. Coleta todos os valores do `debugInfo` em texto formatado (mesma estrutura visual do painel)
2. Usa `navigator.clipboard.writeText()` para copiar
3. Mostra feedback visual ("Copiado!") por 2 segundos via estado local

O botão ficará logo após o `<summary>`, antes das linhas de dados. Texto: **"📋 Copiar log"** → muda para **"✅ Copiado!"** temporariamente.

Nenhum outro arquivo alterado.

