
# Plano: Rebranding do Sistema para "Busão Off Off"

## Resumo

Atualizar toda a identidade visual do sistema, substituindo "PassBus" por "Busão Off Off" e incorporando a logo oficial fornecida.

---

## Alterações Necessárias

### 1. Adicionar Logo ao Projeto
- Copiar a imagem `Logo_2.jpeg` para `src/assets/logo.jpeg`
- A logo será usada no header, sidebar e tela de login

### 2. Atualizar `index.html`
- Título: "Busão Off Off - Passagens para Eventos"
- Meta description: "Sistema de gestão e venda de passagens de ônibus e vans para eventos"
- Atualizar og:title e twitter:card

### 3. Atualizar Componentes React

| Arquivo | Mudanças |
|---------|----------|
| `src/components/layout/AdminSidebar.tsx` | Substituir ícone Bus + texto "PassBus" pela logo "Busão Off Off" |
| `src/components/layout/PublicLayout.tsx` | Substituir ícone Bus + texto "PassBus" pela logo e atualizar footer |
| `src/pages/Login.tsx` | Substituir ícone Bus + texto "PassBus" pela logo |
| `src/index.css` | Atualizar comentário do design system |

### 4. Criar Componente de Logo Reutilizável (Opcional mas Recomendado)
- Criar `src/components/Logo.tsx` para centralizar o uso da logo
- Facilita manutenção futura caso a logo mude novamente

---

## Detalhes Técnicos

### Arquivos a Modificar

```text
src/assets/logo.jpeg (NOVO - copiar do upload)
src/components/Logo.tsx (NOVO - componente reutilizável)
index.html
src/components/layout/AdminSidebar.tsx
src/components/layout/PublicLayout.tsx
src/pages/Login.tsx
src/index.css
```

### Exemplo do Componente Logo

```tsx
// src/components/Logo.tsx
import logo from "@/assets/logo.jpeg";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = false }: LogoProps) {
  const sizes = {
    sm: "h-8",
    md: "h-10", 
    lg: "h-16"
  };
  
  return (
    <div className="flex items-center gap-2">
      <img src={logo} alt="Busão Off Off" className={sizes[size]} />
      {showText && <span className="font-bold">Busão Off Off</span>}
    </div>
  );
}
```

---

## Resultado Esperado

- Logo "Busão Off Off" visível em todas as áreas do sistema
- Título da página atualizado no navegador
- Footer com copyright "Busão Off Off"
- Identidade visual consistente entre portal público e painel admin
