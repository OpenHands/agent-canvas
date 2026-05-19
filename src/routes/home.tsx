import { PrefetchPageLinks } from "react-router";
import { HomeChatLauncher } from "#/components/features/home/home-chat-launcher";
import { OnboardingHost } from "#/components/features/onboarding";

<PrefetchPageLinks page="/conversations/:conversationId" />;

function HomeScreen() {
  return (
    <div
      data-testid="home-screen"
      className="custom-scrollbar-always flex h-full flex-col overflow-y-auto rounded-xl bg-transparent px-4 md:px-0 lg:px-[42px]"
    >
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center">
        <HomeChatLauncher />
      </div>

      <OnboardingHost />
    </div>
  );
}

export default HomeScreen;
