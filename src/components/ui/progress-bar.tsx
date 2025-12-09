// components/ui/progress-bar.tsx
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0 à 100 */
  value: number;
  className?: string;
  /** Classe Tailwind pour la barre interne (par défaut bleu) */
  barClassName?: string;
  /** Afficher le pourcentage à droite */
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  className,
  barClassName,
  showLabel = false,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-2 w-full rounded-full bg-[#2b2b2b] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out",
            barClassName ?? "bg-blue-500",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs tabular-nums text-[#aaaaaa] w-10 text-right">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
