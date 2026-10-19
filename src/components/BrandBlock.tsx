export function BrandBlock({ compact, name = "Munshi", tagline = "Bolo, likho, poochho" }: { compact?: boolean; name?: string; tagline?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-base font-black text-white">م</span>
      <div className="leading-tight">
        <p className="text-[15px] font-black">{name}</p>
        {!compact && <p className="text-[11px] font-semibold text-muted">{tagline}</p>}
      </div>
    </div>
  );
}
