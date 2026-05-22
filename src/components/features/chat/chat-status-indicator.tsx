import { cn } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import DebugStackframeDot from "#/icons/debug-stackframe-dot.svg?react";

interface ChatStatusIndicatorProps {
  status: string;
  statusColor: string;
}

function ChatStatusIndicator({
  status,
  statusColor,
}: ChatStatusIndicatorProps) {
  return (
    <div
      data-testid="chat-status-indicator"
      className={cn(
        "w-full max-w-full rounded-[100px] p-1 bg-[var(--oh-surface)] flex items-center gap-1",
      )}
    >
      {/* Wrap both elements under a single keyed motion.div so AnimatePresence
          mode="wait" sees one child instead of two. Having two separately-keyed
          children inside mode="wait" triggers the framer-motion warning
          "attempting to animate multiple children" because wait mode expects
          only one child to exit before the next one enters. */}
      <AnimatePresence mode="wait">
        <motion.span
          key={status}
          className="contents"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Dot */}
          <span className="flex-shrink-0 animate-[pulse_1.2s_ease-in-out_infinite]">
            <DebugStackframeDot className="w-4 h-4" color={statusColor} />
          </span>

          {/* Text */}
          <span className="pr-1.5 font-normal text-[11px] leading-[16px] normal-case break-words whitespace-normal">
            {status}
          </span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export default ChatStatusIndicator;
