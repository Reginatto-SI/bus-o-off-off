import { Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import { resolveCompanyDomainRedirect } from '@/lib/companyDomainRouting';

export default function PublicRootRedirect() {
  const redirectPath = resolveCompanyDomainRedirect({
    hostname: window.location.hostname,
    pathname: window.location.pathname,
  });

  // Estratégia oficial e única deste fluxo: a raiz do hostname mapeado entra pela vitrine canônica
  // /empresa/busaooffoff. Hostnames não mapeados continuam renderizando a landing sem alteração.
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  return <LandingPage />;
}
