import { Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import { resolveCompanyDomainRedirect } from '@/lib/companyDomainRouting';

export default function PublicRootRedirect() {
  const redirectPath = resolveCompanyDomainRedirect({
    hostname: window.location.hostname,
    pathname: window.location.pathname,
  });

  // Quando o domínio atual estiver vinculado a uma empresa, a home pública vira porta de entrada da vitrine.
  // Como este componente só é usado na rota "/", não há risco de loop ao redirecionar para "/empresa/:slug".
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  return <LandingPage />;
}
