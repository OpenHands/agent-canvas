import { cn } from "#/utils/utils";

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  className?: string;
}

export function ResizeHandle({ onMouseDown, className }: ResizeHandleProps) {
  return (
    <div
      className={cn("relative z-10 w-0 shrink-0 self-stretch", className)}
      aria-hidden
    >
      <div
        className="absolute inset-y-0 left-1/2 w-3 min-w-[12px] -translate-x-1/2 cursor-ew-resize"
        onMouseDown={onMouseDown}
      />
    </div>
  );
}
