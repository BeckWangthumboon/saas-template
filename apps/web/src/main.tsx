import './index.css';

import { ConvexProviderWithAuthKit } from '@convex-dev/workos';
import { api } from '@saas/convex-api';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { AuthKitProvider } from '@workos-inc/authkit-react';
import { useAuth } from '@workos-inc/authkit-react';
import { AutumnProvider } from 'autumn-js/react';
import { ConvexReactClient } from 'convex/react';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { env } from './env';
import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

createRoot(root).render(
  <StrictMode>
    <AuthKitProvider
      clientId={env.VITE_WORKOS_CLIENT_ID}
      redirectUri={env.VITE_WORKOS_REDIRECT_URI}
    >
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <AutumnProvider
          convex={convex}
          convexApi={(api as unknown as Record<'billing/autumn', unknown>)['billing/autumn']}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <RouterProvider router={router} />
          </ThemeProvider>
        </AutumnProvider>
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  </StrictMode>,
);
