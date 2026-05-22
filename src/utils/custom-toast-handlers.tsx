import { CSSProperties } from "react";
import { CircleX } from "lucide-react";
import toast, { ToastOptions } from "react-hot-toast";
import { calculateToastDuration } from "./toast-duration";
import i18n from "#/i18n";

// react-hot-toast accepts only CSSProperties via the style option — cannot use className
const TOAST_STYLE: CSSProperties = {
  background: "var(--oh-color-tertiary)",
  border: "1px solid var(--oh-border-input)",
  color: "#fff",
  borderRadius: "var(--oh-radius)",
  maxWidth: "400px",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
};

export const TOAST_OPTIONS: ToastOptions = {
  position: "top-right",
  style: TOAST_STYLE,
};

const ERROR_TOAST_ICON = (
  <CircleX
    aria-hidden
    size={20}
    strokeWidth={2}
    className="shrink-0 text-[var(--oh-status-error)]"
  />
);

export const ERROR_TOAST_OPTIONS: ToastOptions = {
  ...TOAST_OPTIONS,
  icon: ERROR_TOAST_ICON,
};

export const displayErrorToast = (error: string | null | undefined) => {
  const errorMessage = error || i18n.t("STATUS$ERROR");
  const duration = calculateToastDuration(errorMessage, 4000);
  toast.error(
    <span className="[word-break:break-word] [overflow-wrap:anywhere]">
      {errorMessage}
    </span>,
    { ...ERROR_TOAST_OPTIONS, duration },
  );
};

export const displaySuccessToast = (message: string) => {
  const duration = calculateToastDuration(message, 5000);
  toast.success(
    <span className="[word-break:break-word] [overflow-wrap:anywhere]">
      {message}
    </span>,
    { ...TOAST_OPTIONS, duration },
  );
};
