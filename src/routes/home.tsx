import { PrefetchPageLinks } from "react-router";
import { HomeChatLauncher } from "#/components/features/home/home-chat-launcher";
import { OnboardingHost } from "#/components/features/onboarding";

<PrefetchPageLinks page="/conversations/:conversationId" />;

function HomeScreen() {
  return (
    <div
      data-testid="home-screen"
      className="px-0 bg-transparent h-full flex flex-col overflow-y-auto rounded-xl lg:px-[42px] custom-scrollbar-always"
    >
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center">
        <HomeChatLauncher />
      </div>

      <OnboardingHost />
    </div>
  );
}

export default HomeScreen;
