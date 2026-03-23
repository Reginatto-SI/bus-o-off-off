import { Navigate } from 'react-router-dom';

import { resolveCompanyDomainRedirect } from '@/lib/companyDomainRouting';

import LandingPage from './LandingPage';

export default function PublicRootRedirect() {
  const redirectPath = resolveCompanyDomainRedirect(window.location.hostname, window.location.pathname);

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  return <LandingPage />;
}
