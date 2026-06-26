export type AppMode = "code" | "work";

export const APP_MODES = ["code", "work"] as const satisfies readonly AppMode[];
