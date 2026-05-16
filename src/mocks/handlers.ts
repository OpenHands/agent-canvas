import { FILE_SERVICE_HANDLERS } from "./file-service-handlers";
import { TASK_SUGGESTIONS_HANDLERS } from "./task-suggestions-handlers";
import { SECRETS_HANDLERS } from "./secrets-handlers";
import {
  GIT_REPOSITORY_HANDLERS,
  setMockGitChanges,
} from "./git-repository-handlers";
import {
  SETTINGS_HANDLERS,
  MOCK_DEFAULT_USER_SETTINGS,
  resetTestHandlersMockSettings,
} from "./settings-handlers";
import { CONVERSATION_HANDLERS } from "./conversation-handlers";
import { AUTH_HANDLERS } from "./auth-handlers";
import { FEEDBACK_HANDLERS } from "./feedback-handlers";
import { ANALYTICS_HANDLERS } from "./analytics-handlers";
import {
  AUTOMATION_HANDLERS,
  resetAutomationMockData,
} from "./automation-handlers";

export const handlers = [
  ...FILE_SERVICE_HANDLERS,
  ...TASK_SUGGESTIONS_HANDLERS,
  ...SECRETS_HANDLERS,
  ...GIT_REPOSITORY_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...CONVERSATION_HANDLERS,
  ...AUTH_HANDLERS,
  ...FEEDBACK_HANDLERS,
  ...ANALYTICS_HANDLERS,
  ...AUTOMATION_HANDLERS,
];

export {
  MOCK_DEFAULT_USER_SETTINGS,
  resetTestHandlersMockSettings,
  resetAutomationMockData,
  setMockGitChanges,
};
