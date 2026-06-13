import { useEffect } from "react";

// SITE_URL é fixo para garantir canonicals consistentes apontando para o domínio oficial,
// independente do host (preview, lovable.app, smartbusbr.com.br).
const SITE_URL = "https://www.smartbusbr.com.br";

export interface PageMetaOptions {
  /** Título da aba e og:title — manter < 60 caracteres. */
  title: string;
  /** Meta description e og:description — entre 50 e 160 caracteres. */
  description: string;
  /** Caminho canônico iniciando em "/". Ex.: "/eventos". */
  path: string;
  /** Tipo OpenGraph. Default: "website". */
  ogType?: "website" | "article";
  /** URL absoluta para og:image (opcional). */
  ogImage?: string;
}

// Define ou atualiza uma <meta> por name/property mantendo apenas uma instância no <head>.
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

// Define ou atualiza <link rel="canonical"> garantindo um único canonical por rota.
function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/**
 * Aplica metadados de SEO (title, description, canonical e OpenGraph)
 * para a rota atual via DOM. Evita dependência adicional (react-helmet-async)
 * mantendo o bundle enxuto. As mudanças são por rota e revertidas implicitamente
 * pela próxima rota que também usa o hook.
 */
export function usePageMeta(options: PageMetaOptions) {
  const { title, description, path, ogType = "website", ogImage } = options;

  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${path}`;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertCanonical(canonicalUrl);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:type", ogType);
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    if (ogImage) {
      upsertMeta("property", "og:image", ogImage);
      upsertMeta("name", "twitter:image", ogImage);
    }
  }, [title, description, path, ogType, ogImage]);
}
