import { NewConversationButton } from "#/components/features/conversation-panel/new-conversation-button";

/**
 * Home-screen wrapper around the same `NewConversationButton` used in the
 * left-hand sidebar: a single trigger that opens an inline workspace picker
 * popover. The wrapper just centers the button and gives the popover a
 * comfortable width on the home page.
 */
export function HomeNewConversation() {
  return (
    <div
      data-testid="home-new-conversation"
      className="w-full max-w-[360px] mx-auto"
    >
      <NewConversationButton />
    </div>
  );
}
