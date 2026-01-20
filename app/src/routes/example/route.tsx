/**
 * EXAMPLE LAYOUT - Delete this folder when building your app
 *
 * This demonstrates a basic app shell pattern with:
 * - Full-width header at top
 * - Sidebar navigation on the left 
 * - Main content area with Outlet
 *
 * Use this as a reference for building your own layout in _app/route.tsx
 */

import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { FileTextIcon, LayoutDashboardIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/example')({
  component: ExampleLayout,
});

const examplePages = [
  { label: 'Overview', href: '/example', icon: LayoutDashboardIcon },
  { label: 'Form', href: '/example/form', icon: FileTextIcon },
] as const;

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: typeof LayoutDashboardIcon  ;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

function ExampleLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header - full width at top */}
      <header className="h-14 border-b px-4 flex items-center justify-between shrink-0">
        <Link to="/example" className="font-semibold text-lg">
          SaaS Template
        </Link>
        <nav className="flex items-center gap-2">
          {/* Add user menu, theme toggle, etc. here */}
          <Button variant="ghost" size="sm">
            Sign out
          </Button>
        </nav>
      </header>

      {/* Below header: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r bg-muted/40 p-3 shrink-0">
          <nav className="flex flex-col gap-1">
            {examplePages.map((page) => (
              <NavItem
                key={page.href}
                href={page.href}
                icon={page.icon}
                label={page.label}
                isActive={location.pathname === page.href}
              />
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
