"""Canvas conversation control tool.

Shipped with Agent Canvas. Mounted into the agent-server container at
``/canvas-tools`` and loaded via ``tool_module_qualnames`` so the agent can
create fresh child conversations that share the current backend/runtime.

The server-side executor is a no-op that returns an acknowledgment. The actual
conversation creation happens client-side: the frontend watches the WebSocket
stream for ``ActionEvent``s with ``tool_name == "canvas_conversation"`` and
creates the child conversation using the current conversation as the source of
workspace/runtime inheritance.
"""

from collections.abc import Sequence
from typing import Literal

from pydantic import Field

from openhands.sdk import Action, Observation, ToolDefinition
from openhands.sdk.tool import ToolAnnotations, ToolExecutor, register_tool


CanvasConversationCommand = Literal["create_child_conversation"]


class CanvasConversationAction(Action):
    """Create a fresh child conversation in Agent Canvas."""

    command: CanvasConversationCommand = Field(description="Conversation command to dispatch.")
    prompt: str = Field(
        description=(
            "Full handoff prompt for the child conversation. The child starts with "
            "fresh context, so include any relevant background, goals, and constraints."
        )
    )


class CanvasConversationObservation(Observation):
    """Acknowledgment that the conversation command was dispatched."""


class CanvasConversationExecutor(
    ToolExecutor[CanvasConversationAction, CanvasConversationObservation]
):
    def __call__(
        self,
        action: CanvasConversationAction,
        conversation=None,  # noqa: ARG002
    ) -> CanvasConversationObservation:
        return CanvasConversationObservation.from_text(
            f"Conversation command '{action.command}' dispatched to the Agent Canvas frontend."
        )


_CANVAS_CONVERSATION_DESCRIPTION = """The user is interacting with you inside Agent Canvas. This tool lets you ask the frontend to create a fresh child conversation that appears in the normal Conversations list.

Use this when the user explicitly wants a separate thread/chat/conversation for follow-up work, or when you need a fresh-context child conversation that should share the current backend/runtime.

Important semantics:
- The child conversation is FRESH CONTEXT. It does NOT fork/copy this conversation's event history.
- Because the child starts fresh, you must put all relevant context into `prompt`.
- The child reuses the current backend/runtime:
  - Local backend: same workspace/directory as the current conversation
  - Cloud backend: same sandbox/backend as the current conversation
- This is intentionally closer to `/new` semantics than to `fork()` semantics.
- The new conversation should show up in the normal Conversations list.

Parameters:
- command="create_child_conversation"
- prompt=<full handoff prompt for the child conversation>
"""


class CanvasConversationTool(
    ToolDefinition[CanvasConversationAction, CanvasConversationObservation]
):
    """Tool for creating child conversations from Agent Canvas."""

    @classmethod
    def create(
        cls,
        conv_state=None,  # noqa: ARG003
        **params,  # noqa: ARG003
    ) -> Sequence["CanvasConversationTool"]:
        return [
            cls(
                description=_CANVAS_CONVERSATION_DESCRIPTION,
                action_type=CanvasConversationAction,
                observation_type=CanvasConversationObservation,
                executor=CanvasConversationExecutor(),
                annotations=ToolAnnotations(
                    readOnlyHint=False,
                    destructiveHint=False,
                    idempotentHint=False,
                    openWorldHint=False,
                ),
            )
        ]


register_tool("canvas_conversation", CanvasConversationTool)
