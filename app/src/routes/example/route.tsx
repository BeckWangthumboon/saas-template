/**
 * EXAMPLE LAYOUT - Delete this folder when building your app
 *
 * This demonstrates a basic app shell pattern with:
 * - Header with logo and navigation
 * - Main content area with Outlet
 *
 * Use this as a reference for building your own layout in _app/route.tsx
 */

import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const Route = createFileRoute('/example')({
  component: ExampleLayout,
});

/**
 * Example pages - add more as you build them
 */
const examplePages = [
  { label: 'Overview', href: '/example' },
  { label: 'Form', href: '/example/form' },
  // Add more examples here:
  // { label: 'Tables', href: '/example/tables' },
] as const;

function ExampleLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Find current page label for the selector
  const currentPage = examplePages.find((p) => p.href === location.pathname) ?? examplePages[0];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 border-b px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/example" className="font-semibold text-lg">
            SaaS Template
          </Link>
          <Select
            value={currentPage.href}
            onValueChange={(href) => {
              void navigate({ to: href });
            }}
          >
            <SelectTrigger size="sm" className="w-[140px] bg-muted/40 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {examplePages.map((page) => (
                <SelectItem key={page.href} value={page.href}>
                  {page.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav className="flex items-center gap-2">
          {/* Add user menu, theme toggle, etc. here */}
          <Button variant="ghost" size="sm">
            Sign out
          </Button>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
