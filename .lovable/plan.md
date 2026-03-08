

## Plano: Wizard passo a passo para criação de patrocinador

Transformar o modal de criação de patrocinador em um fluxo wizard de 4 etapas com salvamento progressivo, seguindo o padrão visual do wizard de eventos.

### Arquivo: `src/pages/admin/Sponsors.tsx`

**Mudanças principais:**

1. **Adicionar estado de wizard**: `wizardStep` (1-4), `isCreateWizardMode` (true quando criando novo, false ao editar)

2. **Barra de progresso**: Substituir as `TabsList` por uma barra de progresso visual com 4 steps numerados (Dados, Banner, Redirecionamento, Contato) — mesmo padrão visual do wizard de eventos

3. **Etapa 1 — Dados básicos**: Nome (obrigatório), Status, Ordem no carrossel. Botão "Salvar e continuar" que faz insert no banco, obtém o ID, seta `editingId`, e avanca para step 2

4. **Etapa 2 — Banner**: Upload de banner (já funciona pois `editingId` existe). Botões: Voltar / Continuar

5. **Etapa 3 — Redirecionamento**: Tipo de link, URL/WhatsApp. **Remover obrigatoriedade da URL do site** (remover validação `if (form.link_type === 'site' && !form.site_url.trim())`). Botões: Voltar / Continuar

6. **Etapa 4 — Contato**: Campos opcionais (nome, telefone, email). Botões: Voltar / Finalizar cadastro

**Lógica de salvamento progressivo:**
- Step 1: `INSERT` no banco → obtém ID → avança
- Steps 2-4: ao avançar ou finalizar, faz `UPDATE` com os dados atuais do form
- Ao "Finalizar cadastro": salva, fecha modal, recarrega lista

**Modo edição:**
- Quando `handleEdit` é chamado, `isCreateWizardMode = false`
- Mostra as abas tradicionais (livre navegação) como hoje, sem wizard forçado
- Mantém botão "Salvar" normal

**Remover validação obrigatória de URL:**
- Linhas 206-210: remover o bloco que exige `site_url` quando `link_type === 'site'`

**Atualizar texto do empty state:**
- Linha 789: "Cadastre patrocinadores para aparecerem no carrossel do app" → "Cadastre patrocinadores base para vincular aos seus eventos."

### Resultado
- Criação segue wizard progressivo de 4 etapas
- Edição mantém abas livres
- Upload de banner só disponível após salvar (step 1 garante ID)
- URL do site passa a ser opcional
- Consistente com padrão visual do wizard de eventos

