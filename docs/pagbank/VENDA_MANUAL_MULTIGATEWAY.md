# Venda manual multi-gateway — implantação por etapas

Regras aprovadas: cobrar somente a taxa; ausência comprovada de sócio/representante
seleciona a tabela do PRD 01 sem dívida. Beneficiário elegível sem liquidação direta
preserva seu direito com obrigação de repasse. Resultado incerto não equivale a
ausência. Reserva vencida com cobrança pendente/incerta preserva lugares e bloqueia
embarque até conciliação. Não há transferências/estornos automáticos.

## Etapa 1 — segurança Asaas

O endpoint administrativo exige sessão e papel gerente da empresa ou capacidade
global developer. A consulta de taxa manual existente usa a conta da plataforma
no ambiente congelado, inclusive nos vínculos históricos Asaas de vendas PagBank.
Testes locais de autorização e caracterização passaram (9 testes). Não houve
implantação, mudança de credenciais ou escrita no banco conectado.

Etapas seguintes: operação privada/idempotência, cadastro/finalização atômicos,
ledger/conciliação/expiração, adapter PagBank Sandbox e piloto controlado.
A migration 0002 e o checkout público permanecem preservados.
