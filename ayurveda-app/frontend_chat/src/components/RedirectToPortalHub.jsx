import { useEffect } from 'react';
import { PORTAL_HUB_URL } from '../utils/portalHub';

/** Patient app must not host the landing page — send users to portal-hub. */
export default function RedirectToPortalHub() {
  useEffect(() => {
    window.location.replace(PORTAL_HUB_URL);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-300 p-6 text-center">
      <p className="text-sm font-semibold">Opening portal…</p>
      <p className="text-xs text-slate-500">
        If you are not redirected,{' '}
        <a href={PORTAL_HUB_URL} className="text-sky-400 underline font-semibold">
          open {PORTAL_HUB_URL}
        </a>
      </p>
    </div>
  );
}
