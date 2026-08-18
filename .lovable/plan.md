# Câmera traseira: escolher a lente que o aparelho realmente entrega

## O que o teste no Webcam Tests provou

No mesmo Chrome, mesmo aparelho (Galaxy S24 Ultra, Android), o Webcam Tests funciona — mas apenas com **camera 0, facing back** selecionada explicitamente. O site lista quatro lentes (0 e 2 traseiras, 1 e 3 frontais) e permite escolher uma a uma; só a 0 abre. A ficha técnica confirma stream real: 480x640, 30 FPS.

Isso muda o diagnóstico anterior. O aparelho não está com a câmera travada: existe **uma** lente traseira funcional e outras que o sistema não entrega. Quando o SmartBus pede `facingMode: { ideal: 'environment' }`, o Chrome escolhe a lente traseira por conta própria — e nesse aparelho ele escolhe uma que resolve em ~4,7 s com a track já `ended`. O Webcam Tests não usa `facingMode`: ele usa `deviceId` da lente escolhida pelo usuário.

Ou seja: a correção não é mexer em `facingMode`, é **selecionar a lente por `deviceId`, testando as traseiras até uma entregar track viva** — e lembrar dela.

Tentativas anteriores com `deviceId` falharam porque combinavam `facingMode: { exact }`, fila de candidatos montada antes da permissão e descarte por critérios extras. Aqui a regra é mais simples e direta.

## O que será feito

### 1. Seleção de lente traseira por `deviceId`, na ordem certa

Ao clicar em "Câmera traseira":

```text
1. abre a lente lembrada (localStorage) se houver → track live? usa.
2. senão: getUserMedia({ video: true }) só para garantir permissão/labels
3. enumerateDevices() → filtra videoinput traseiras
   (facingMode das capabilities; se ausente, usa a ordem/label)
4. tenta uma a uma, na ordem da enumeração, encerrando a anterior antes:
   getUserMedia({ video: { deviceId: { exact: id } } })
   → track live e stream ativo? adota, salva o deviceId e para.
   → track ended? descarta, encerra e vai para a próxima.
5. nenhuma serve → mensagem de erro (item 3)
```

A frontal continua exatamente como está hoje (`facingMode: { ideal: 'user' }`), porque funciona em 533 ms.

### 2. Lente lembrada por aparelho

O `deviceId` que funcionou fica salvo no navegador do aparelho. Nas próximas aberturas a câmera abre direto nele, sem varredura — abertura rápida como a frontal. Se ele falhar depois (troca de aparelho, navegador reinstalado), a lembrança é descartada e a varredura roda de novo automaticamente.

### 3. Seletor manual de lente (fallback visível)

Se a varredura não encontrar nenhuma lente traseira viva, a tela mostra a lista de câmeras do aparelho (como o Webcam Tests faz) para o motorista escolher manualmente. A escolha manual também é lembrada. Isso garante que nunca fiquemos sem saída em um aparelho novo.

### 4. Log de homologação

Mantido e ampliado: quantas lentes traseiras foram encontradas, qual `deviceId` (abreviado) foi tentado, tempo de cada tentativa, `readyState` resultante e qual foi adotada.

## O que não será feito

Sem retry cego, sleep artificial, watchdog, troca automática para a frontal, resolução forçada ou regra por fabricante. Uma tentativa por lente, na ordem, com encerramento limpo entre elas.

## Detalhes técnicos

Arquivos alterados:

- `src/pages/driver/DriverValidate.tsx` — seleção por `deviceId` com varredura ordenada, persistência da lente aprovada, seletor manual e logs.
- `src/lib/driverPreferences.ts` — chave de persistência da lente traseira aprovada.
- `src/pages/driver/DriverValidate.test.ts` — contratos: lente lembrada usada primeiro; varredura só quando necessário; encerramento da tentativa anterior antes da próxima; adoção da primeira lente `live`; descarte de lente `ended`; frontal permanece em `facingMode: ideal`; nenhum stream duplicado.

Nada de backend, banco, pagamentos, vendas, embarque ou autenticação é tocado. O laboratório isolado passa a permitir escolher a lente, refletindo o teste que você fez no Webcam Tests.
