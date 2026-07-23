# PR evidence — #1913 (ACP onboarding dead-lock)

Screenshots captured against a locally-running stack (`npm run dev:static`,
agent-server 1.36.1) in the exact state the issue describes: an **active ACP
agent profile** and **zero LLM profiles**.

| File | What it shows |
| --- | --- |
| `before-llm-redirected.png` | Pre-fix: visiting `/settings/llm` bounces to `/settings/agents`; LLM / Condenser / Verification greyed out. |
| `after-llm-reachable.png` | Post-fix: `/settings/llm` renders with "Add LLM Profile"; Condenser / Verification stay greyed. |
| `after-openhands-profile-saveable.png` | Post-fix: the OpenHands agent-profile editor now offers the LLM profile selector with Save enabled. |
