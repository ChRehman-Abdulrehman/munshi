export function BrandBlock({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-base font-black text-white">م</span>
      <div className="leading-tight">
        <p className="text-[15px] font-black">Munshi</p>
        {!compact && <p className="text-[11px] font-semibold text-muted">Bolo, likho, poochho</p>}
      </div>
    </div>
  );
}
