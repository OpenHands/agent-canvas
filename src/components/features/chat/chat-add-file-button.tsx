import { Plus } from "lucide-react";
import { cn } from "#/utils/utils";

export interface ChatAddFileButtonProps {
  handleFileIconClick: () => void;
  disabled?: boolean;
}

export function ChatAddFileButton({
  handleFileIconClick,
  disabled = false,
}: ChatAddFileButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative shrink-0 size-6 rounded-full transition-colors",
        disabled
          ? "cursor-not-allowed text-[#6B7280]"
          : "cursor-pointer text-[#959CB2] hover:text-white hover:bg-white/10",
      )}
      aria-label="Add file"
      data-testid="paperclip-icon"
      onClick={handleFileIconClick}
      disabled={disabled}
    >
      <span className="flex h-full w-full items-center justify-center">
        <Plus className="h-[13px] w-[13px] shrink-0" strokeWidth={2} />
      </span>
    </button>
  );
}
