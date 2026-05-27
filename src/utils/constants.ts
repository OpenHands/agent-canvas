import { SlashCommandItem } from "#/hooks/chat/use-slash-command";

export const ASSET_FILE_TYPES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".gif",
  ".pdf",
  ".mp4",
  ".webm",
  ".ogg",
];

export const JSON_VIEW_THEME = {
  base00: "transparent", // background
  base01: "var(--cool-grey-900)", // lighter background
  base02: "var(--cool-grey-700)", // selection background
  base03: "var(--cool-grey-600)", // comments, invisibles
  base04: "var(--cool-grey-500)", // dark foreground
  base05: "var(--cool-grey-200)", // default foreground
  base06: "var(--cool-grey-100)", // light foreground
  base07: "#ffffff", // light background
  base08: "#ff5370", // variables, red
  base09: "#f78c6c", // integers, orange
  base0A: "#ffcb6b", // booleans, yellow
  base0B: "#c3e88d", // strings, green
  base0C: "#89ddff", // support, cyan
  base0D: "#82aaff", // functions, blue
  base0E: "#c792ea", // keywords, purple
  base0F: "#ff5370", // deprecated, red
};

export const DOCUMENTATION_URL = {
  MICROAGENTS: {
    MICROAGENTS_OVERVIEW:
      "https://docs.all-hands.dev/usage/prompting/microagents-overview",
  },
};

export const PRODUCT_URL = {
  PRODUCTION: "https://app.all-hands.dev",
};

export const SETTINGS_FORM = {
  LABEL_CLASSNAME: "text-[11px] font-medium leading-4 tracking-[0.11px]",
};

export const GIT_PROVIDER_OPTIONS = [
  {
    label: "GitHub",
    value: "github",
  },
  {
    label: "GitLab",
    value: "gitlab",
  },
  {
    label: "Bitbucket",
    value: "bitbucket",
  },
];

// Chat input constants
export const CHAT_INPUT = {
  HEIGHT_THRESHOLD: 100, // Height in pixels when suggestions should be hidden
};

// UI tolerance constants
export const EPS = 1.5; // px tolerance for "near min" height comparisons

/** The /btw slash command — asks a side question via the ask_agent endpoint. */
export const BTW_COMMAND = "/btw";

/** The /model slash command — lists or switches the conversation's LLM profile. */
export const MODEL_COMMAND = "/model";

/** Built-in slash commands surfaced in the menu for V1 conversations. */
export const BUILT_IN_COMMANDS: SlashCommandItem[] = [
  {
    skill: {
      name: "new",
      type: "agentskills",
      content: "Creates a new conversation using the same runtime",
      triggers: ["/new"],
    },
    command: "/new",
  },
  {
    skill: {
      name: "btw",
      type: "agentskills",
      content: "Ask the agent a side question without derailing the main task",
      triggers: [BTW_COMMAND],
    },
    command: BTW_COMMAND,
  },
  {
    skill: {
      name: "model",
      type: "agentskills",
      content:
        "List saved LLM profiles, or switch the conversation LLM profile with /model <name>",
      triggers: [MODEL_COMMAND],
    },
    command: MODEL_COMMAND,
  },
];

// Skill content metadata prefixes
export const METADATA_PREFIXES: readonly string[] = [
  "The following information has been included",
  "It may or may not be relevant",
  "Skill location:",
  "(Use this path to resolve",
];
