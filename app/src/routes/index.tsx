import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center text-3xl font-semibold text-foreground">
      Home
    </main>
  );
}
