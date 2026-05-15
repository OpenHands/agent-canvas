# Snapshot Test Coverage Plan

Visual regression tests that should be added to this directory. Each proposed
spec file maps to one feature area. Tests follow the existing patterns:
`setupMocks` + `dismissConsentModal` for static pages; `navigateToConversation`
+ `injectEvents` / `window.__OH_EVENT_STORE__` for conversation-page scenarios;
`animations: "disabled"` and `maxDiffPixelRatio: 0.01` on every
`toHaveScreenshot()` call.

Existing coverage is marked **✅ done**. Everything else is proposed.

---

## 1. Home Screen

**File:** `home-screen.snapshot.spec.ts`
**Existing:** ✅ `home-screen.png` in `settings-page.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `home-empty-no-workspace` | No workspaces stored |
| `home-with-workspace-selected` | One workspace selected in the dropdown |
| `home-workspace-dropdown-open` | Workspace dropdown expanded showing stored workspaces |
| `home-folder-browser-modal` | `FolderBrowserModal` open with a mocked directory listing |
| `home-manage-workspaces-modal` | `ManageWorkspacesModal` open with two workspaces listed |
| `home-task-suggestions-loading` | Task suggestions skeleton (loading state) |
| `home-task-suggestions-loaded` | Task suggestion cards visible |

---

## 2. Onboarding Modal

**File:** `onboarding.snapshot.spec.ts`

Mock `openhands-onboarded` absent from localStorage so the modal appears. Use
`page.addInitScript` to clear the key. Step navigation is driven by clicking
the "Next" / "Back" buttons between snapshots.

| Snapshot name | State to capture |
|---|---|
| `onboarding-step-0-choose-agent` | Step 0 – agent cards; OpenHands selected, others "coming soon" |
| `onboarding-step-1-check-backend-connecting` | Step 1 – backend form with status banner in connecting state |
| `onboarding-step-1-check-backend-connected` | Step 1 – status banner green (mock `/server_info` 200) |
| `onboarding-step-1-check-backend-error` | Step 1 – status banner red (mock `/server_info` 500) |
| `onboarding-step-2-setup-llm` | Step 2 – LLM settings form embedded (basic view) |
| `onboarding-step-3-say-hello` | Step 3 – pre-filled message input |
| `onboarding-progress-bar-step-2` | Progress bar at step 2 (two segments completed) |

---

## 3. Settings Pages

**File:** `settings.snapshot.spec.ts`
**Existing:** ✅ `settings-page.png`, `settings-app-page.png` in `settings-page.snapshot.spec.ts`

### LLM Settings
| Snapshot name | State to capture |
|---|---|
| `settings-llm-basic-view` | Model picker + API key (no custom base URL) |
| `settings-llm-basic-api-key-set` | API key field showing the "key set" icon |
| `settings-llm-advanced-view` | "All settings" view: custom model string + base URL + API key |
| `settings-llm-openhands-model-help` | OpenHands model selected → help link visible below API key |
| `settings-llm-profiles-list` | LLM profiles manager showing two profile rows |
| `settings-llm-profiles-rename-modal` | Rename profile modal open |
| `settings-llm-profiles-delete-modal` | Delete profile confirmation modal open |
| `settings-llm-dirty-save-button` | Save button enabled after a field change |

### Condenser Settings
| Snapshot name | State to capture |
|---|---|
| `settings-condenser` | Schema-driven condenser form loaded |

### Verification Settings
| Snapshot name | State to capture |
|---|---|
| `settings-verification-confirmation-off` | Confirmation mode toggle off (security analyzer hidden) |
| `settings-verification-confirmation-on` | Confirmation mode toggle on → security analyzer dropdown visible |

### App Settings
| Snapshot name | State to capture |
|---|---|
| `settings-app-default` | ✅ Already captured as `settings-app-page.png`; keep as baseline |
| `settings-app-dirty` | At least one field changed, Save button enabled |

### Secrets Settings
| Snapshot name | State to capture |
|---|---|
| `settings-secrets-empty` | No secrets, only the "Add New Secret" button |
| `settings-secrets-list` | Three secrets listed in the table |
| `settings-secrets-add-form` | Add-secret form open |
| `settings-secrets-edit-form` | Edit-secret form open (secret name pre-populated) |
| `settings-secrets-delete-confirm` | Confirmation modal open with secret name in text |

### Settings Navigation
| Snapshot name | State to capture |
|---|---|
| `settings-nav-llm-active` | Left nav with LLM link highlighted |
| `settings-nav-secrets-active` | Left nav with Secrets link highlighted |

---

## 4. MCP Page

**File:** `mcp-page.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `mcp-page-empty` | No installed servers, full marketplace visible |
| `mcp-page-with-installed` | Two installed servers (one SSE, one STDIO) in the installed section |
| `mcp-marketplace-card-uninstalled` | A marketplace card in default state |
| `mcp-marketplace-card-installed` | Same card showing "Installed" badge |
| `mcp-search-filtered` | Search query "slack" – only matching cards visible |
| `mcp-install-modal` | `InstallServerModal` open for a marketplace entry |
| `mcp-custom-server-editor-sse` | Custom server editor showing SSE form |
| `mcp-custom-server-editor-stdio` | Custom server editor showing stdio form |
| `mcp-delete-confirm-modal` | Delete confirmation modal open |

---

## 5. Skills Page

**File:** `skills-page.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `skills-loading` | Skeleton pulse placeholders |
| `skills-loaded` | 2-column grid with several skill cards (enabled + disabled) |
| `skills-card-enabled` | Single enabled skill card (close-up via `getByTestId`) |
| `skills-card-disabled` | Single disabled skill card |
| `skills-search-filtered` | Search query applied, subset of cards visible |
| `skills-no-match` | Search query returns zero results – "no match" message |
| `skills-empty-from-server` | Server returns no skills – empty state text |

---

## 6. Automations

**File:** `automations.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `automations-loading` | Skeleton cards (health check in-flight) |
| `automations-backend-not-configured` | `BackendNotConfigured` full-page state |
| `automations-empty` | Backend healthy but zero automations |
| `automations-list-active-inactive` | Active group (2 cards) + Inactive group (1 card) |
| `automations-search-filtered` | Search narrows list to one card |
| `automations-delete-modal` | Delete confirmation modal open over the list |
| `automations-detail-active` | Detail page – active automation, all sections visible |
| `automations-detail-activity-log` | Detail page – activity log section with run entries |

---

## 7. Backend Management

**File:** `backends.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `backend-selector-single` | Dropdown closed, one backend, green status dot |
| `backend-selector-multiple` | Dropdown open, two backends with status dots |
| `backend-selector-error-dot` | Dropdown open, one backend with red status dot |
| `backend-add-modal` | `BackendFormModal` open in "add" mode |
| `backend-edit-modal` | `BackendFormModal` open in "edit" mode, fields pre-filled |
| `backend-manage-modal` | `ManageBackendsModal` listing two backends |
| `backend-unavailable-recovery` | Full-screen recovery: "Manage Backends" modal over dark backdrop |
| `environment-switch-overlay` | `EnvironmentSwitchOverlay` visible during backend switch |

---

## 8. Analytics Consent Modal

**File:** `settings-page.snapshot.spec.ts` (already exists)
**Existing:** ✅ `analytics-consent-modal.png`

No new snapshots needed; keep existing baseline.

---

## 9. Conversation Page – Happy Path

**File:** `conversation-happy-path.snapshot.spec.ts`

All tests use `navigateToConversation` + `injectEvents` via
`window.__OH_EVENT_STORE__`. Use serial mode.

| Snapshot name | State to capture |
|---|---|
| `conversation-chat-messages-skeleton` | Before events load (store empty, skeleton visible) |
| `conversation-user-message` | Single user message injected |
| `conversation-assistant-message` | User message + assistant text message |
| `conversation-event-group-collapsed` | Two back-to-back action events folded into a group (collapsed) |
| `conversation-event-group-expanded` | Same group after clicking to expand |
| `conversation-finish-event` | `FinishAction` event rendered (green check or finish card) |
| `conversation-typing-indicator` | `RUNNING` state injected – typing indicator visible |
| `conversation-right-panel-closed` | Chat takes full width, right-panel toggle button visible |
| `conversation-right-panel-files` | Right panel open on Files tab |
| `conversation-right-panel-terminal` | Right panel open on Terminal tab |
| `conversation-right-panel-planner` | Right panel open on Planner tab, Build button visible |
| `conversation-tab-nav-full` | All tabs visible including Task List (inject task tracker event) |
| `conversation-btw-message-pending` | BTW message with spinner in "pending" state |
| `conversation-btw-message-answered` | BTW message answered, "Got it" button visible |

---

## 10. Conversation Page – Confirmation Mode

**File:** `conversation-confirmation-mode.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `confirmation-mode-locked-icon` | Lock icon visible in chat input row (mock `confirmation_mode: true`) |
| `confirmation-awaiting-normal-risk` | `WAITING_FOR_CONFIRMATION` state + action event → Approve/Reject buttons visible, no risk banner |
| `confirmation-awaiting-high-risk` | Same but action has `security_risk: "high"` → red `RiskAlert` banner above buttons |

---

## 11. Conversation Page – Collapsible Thinking

**File:** `collapsible-thinking.snapshot.spec.ts` (already exists)
**Existing:** ✅ `think-action-collapsed.png`, `think-action-expanded.png`, `reasoning-content-collapsed.png`, `reasoning-content-expanded.png`

No new snapshots needed; keep existing baselines.

---

## 12. Conversation Creation – Error States

**File:** `conversation-creation-errors.snapshot.spec.ts`

These tests mock the relevant API endpoints to trigger each failure path.

| Snapshot name | What to mock | State to capture |
|---|---|---|
| `creation-backend-unavailable` | `GET /server_info` → network error / timeout | Full-screen backend recovery modal rendered over the home route |
| `creation-api-failure-toast` | `POST /api/conversations` → 500 | Home screen + error toast visible in top-right corner |
| `creation-task-polling-error` | `GET /api/conversations/start-tasks/:id` → `{ status: "ERROR", detail: "Sandbox failed to start" }` | Conversation route showing error toast; button returns to idle |
| `creation-conversation-not-found` | `GET /api/conversations/:id` → 404 | Error toast + redirect back to home (capture just before redirect navigates away) |
| `creation-loading-spinner` | `GET /api/conversations/start-tasks/:id` → `{ status: "PENDING" }` (never resolves) | `ConversationLoading` full-screen spinner |

---

## 13. Conversation Page – In-Progress Error States

**File:** `conversation-errors.snapshot.spec.ts`

All tests use `navigateToConversation` + inject agent state or events. Serial mode.

### Agent error events (inline in chat)
| Snapshot name | State to capture |
|---|---|
| `error-event-known-id` | `AgentErrorEvent` with a known i18n `errorId` – translated title shown, details collapsed |
| `error-event-unknown-id` | `AgentErrorEvent` with unknown `errorId` – generic fallback title |
| `error-event-expanded` | Same event after clicking the chevron – raw markdown details visible |
| `error-event-long-message` | Error with a very long `defaultMessage` – details scroll within the card |

### Agent status bar error states
| Snapshot name | State to capture |
|---|---|
| `agent-status-error` | `ExecutionStatus.ERROR` injected → red `CircleErrorIcon` in status button, error status text in pill |
| `agent-status-stuck` | `ExecutionStatus.STUCK` → same error icon path |
| `agent-status-paused-resume` | `ExecutionStatus.PAUSED` → play/resume button visible |
| `agent-status-running-stop` | `ExecutionStatus.RUNNING` → stop button visible, pulsing dot |
| `agent-status-websocket-closed` | WebSocket mock closed after open → `CircleErrorIcon` |

### ErrorMessageBanner (scroll-up pagination / anchor error)
| Snapshot name | State to capture |
|---|---|
| `error-banner-short` | `setErrorMessage` called with a short message (< 220 chars) – no toggle button |
| `error-banner-long-collapsed` | Long message (> 220 chars) – banner shows line-clamp with "View more" |
| `error-banner-long-expanded` | Same banner after clicking "View more" – full text visible |
| `error-banner-dismissed` | Banner after clicking × – banner no longer rendered |

### Session / WebSocket errors (toast)
| Snapshot name | State to capture |
|---|---|
| `ws-session-expired-toast` | Inject `{ error: true, error_code: 401, message: "..." }` event → "Session expired." toast |
| `ws-generic-error-toast` | Inject `{ error: "Something went wrong", message: "..." }` event → generic error toast |
| `ws-max-iterations-paused` | Inject `{ type: "error", message: "Agent reached maximum..." }` → agent transitions to PAUSED state |

### Send-message failure (optimistic pending bubble)
| Snapshot name | State to capture |
|---|---|
| `pending-message-sending` | Message sent but not echoed yet – faded "sending" bubble |
| `pending-message-error` | Mock `send()` throws → bubble shows error treatment + Retry button |
| `pending-message-after-retry` | After clicking Retry – bubble back to "sending" state |

### File upload validation
| Snapshot name | State to capture |
|---|---|
| `file-upload-too-large-toast` | Attach files exceeding 3 MB limit → error toast (no upload starts) |

---

## 14. Conversation Page – Alert Banner

**File:** `alert-banner.snapshot.spec.ts`

Mock `GET /server_info` (or the relevant endpoint) to return alert payload.

| Snapshot name | State to capture |
|---|---|
| `alert-banner-maintenance` | Maintenance start time set → banner with clock/triangle icon and formatted local time |
| `alert-banner-faulty-models` | Faulty models list → banner listing model names |
| `alert-banner-error-message` | Free-form error string → banner with raw text |
| `alert-banner-dismissed` | Banner after clicking × – not rendered, page unobstructed |

---

## 15. Changes Tab – Diff Viewer Edge Cases

**File:** `changes-tab.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `diff-viewer-modified-file` | Normal modified file – Monaco diff editor visible |
| `diff-viewer-deleted-file` | File with `type: "D"` selected → "file deleted" placeholder, no Monaco editor |
| `diff-viewer-no-changes` | Empty git changes list – empty state text |

---

## 16. Sidebar

**File:** `sidebar.snapshot.spec.ts`

| Snapshot name | State to capture |
|---|---|
| `sidebar-with-conversations` | Conversation list populated, active conversation highlighted |
| `sidebar-empty` | No conversations |
| `sidebar-new-conversation-popover` | "+ New Conversation" popover open showing workspace entries |
| `sidebar-status-dots` | Conversation list showing multiple status dots (finished, running, error, paused) |

---

## Key User Flow Sequences

The following multi-step flows should each be captured as a `test.step()` series
within a single test, producing a sequence of named snapshots that together tell
the story of the flow.

### Flow A – Modify LLM settings → start conversation
**File:** `flow-llm-settings-to-conversation.snapshot.spec.ts`

1. `flow-llm-settings-initial` — LLM settings page, default model
2. `flow-llm-settings-dirty` — Model changed to a new value, Save button enabled
3. `flow-llm-settings-saved` — After save, success toast, button disabled again
4. `flow-llm-conversation-started` — New conversation page, status indicator shows model in use

### Flow B – Enable confirmation mode → agent action requires approval
**File:** `flow-confirmation-mode.snapshot.spec.ts`

1. `flow-confirmation-settings` — Verification settings page, confirmation mode off
2. `flow-confirmation-settings-toggled` — Toggle turned on, security analyzer dropdown appears
3. `flow-confirmation-settings-saved` — Saved, lock icon now shows in conversation input
4. `flow-confirmation-action-pending` — Conversation page: agent at `WAITING_FOR_CONFIRMATION`, Approve/Reject buttons visible
5. `flow-confirmation-high-risk` — Same with `security_risk: "high"` — red RiskAlert above buttons

### Flow C – Add a secret → confirm it appears in the secrets list
**File:** `flow-secrets.snapshot.spec.ts`

1. `flow-secrets-empty` — Secrets settings, empty table
2. `flow-secrets-add-form` — "Add New Secret" form open
3. `flow-secrets-list-populated` — After save, secret appears in the table

### Flow D – Install MCP server → appears as installed
**File:** `flow-mcp-install.snapshot.spec.ts`

1. `flow-mcp-marketplace` — Marketplace, server shows as uninstalled
2. `flow-mcp-install-modal` — Install modal open with form
3. `flow-mcp-installed` — Modal closed, server now in Installed section

### Flow E – Conversation creation failure recovery
**File:** `flow-creation-failure-recovery.snapshot.spec.ts`

1. `flow-recovery-api-down` — Home screen, `/api/conversations` returning 500
2. `flow-recovery-error-toast` — Toast visible after clicking "New Conversation"
3. `flow-recovery-home-intact` — Toast dismissed, home screen unchanged and ready to retry
