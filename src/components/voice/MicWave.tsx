"use client";

export function MicWave({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="flex h-8 items-center justify-center gap-1" aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className={`w-1 rounded-full bg-saffron ${active ? "animate-wave" : ""}`}
          style={{
            height: active ? `${10 + ((i * 7) % 18)}px` : "6px",
            animationDelay: `${i * 90}ms`,
            animationDuration: `${700 + (i % 3) * 120}ms`,
            opacity: active ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}
