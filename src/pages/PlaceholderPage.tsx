interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">{title}</h1>
      <p className="mb-5 text-sm text-slate-500">This report has not been built yet.</p>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-400">
        Not yet built — let us know what columns and data this should show.
      </div>
    </div>
  );
}
