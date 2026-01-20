/**
 * EXAMPLE OVERVIEW - Delete this file when building your app
 *
 * This is the landing page for the example section.
 * It lists all available example patterns for reference.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon, FileTextIcon } from 'lucide-react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/example/')({
  component: ExampleOverviewPage,
});

/**
 * List of example patterns available
 * Add new examples here as you build them
 */
const examples = [
  {
    title: 'Form',
    description: 'Form patterns with TanStack Form, validation, and all field styles.',
    href: '/example/form',
    icon: FileTextIcon,
  },
] as const;

function ExampleOverviewPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Examples</h1>
        <p className="text-muted-foreground mt-1">
          Reference implementations for common patterns. Delete the example/ folder when building
          your app.
        </p>
      </div>

      <div className="grid gap-4">
        {examples.map((example) => (
          <Link key={example.href} to={example.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex-row items-center gap-4">
                <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <example.icon className="size-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{example.title}</CardTitle>
                  <CardDescription>{example.description}</CardDescription>
                </div>
                <ArrowRightIcon className="size-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
