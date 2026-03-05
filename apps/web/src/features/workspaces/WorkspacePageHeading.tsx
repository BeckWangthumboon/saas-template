export function WorkspacePageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}
