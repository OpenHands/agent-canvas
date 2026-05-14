import { PrefetchPageLinks } from "react-router";
import { GuideMessage } from "#/components/features/home/home-header/guide-message";
import { HomeHeaderTitle } from "#/components/features/home/home-header/home-header-title";
import { RepoConnector } from "#/components/features/home/repo-connector";
import { NewConversation } from "#/components/features/home/new-conversation/new-conversation";
import { OnboardingHost } from "#/components/features/onboarding";

<PrefetchPageLinks page="/conversations/:conversationId" />;

function HomeScreen() {
  return (
    <div
      data-testid="home-screen"
      className="px-0 bg-transparent h-full flex flex-col overflow-y-auto rounded-xl lg:px-[42px] custom-scrollbar-always"
    >
      <div className="flex justify-center pt-2">
        <GuideMessage />
      </div>

      <div className="flex flex-1 min-h-0 flex-col justify-center py-8">
        <div className="flex justify-center">
          <HomeHeaderTitle />
        </div>

        <div className="pt-[25px] flex justify-center">
          <div
            className="flex flex-col gap-5 px-6 sm:max-w-full sm:min-w-full md:flex-row lg:px-0 lg:max-w-[703px] lg:min-w-[703px]"
            data-testid="home-screen-new-conversation-section"
          >
            <RepoConnector />
            <NewConversation />
          </div>
        </div>
      </div>

      <OnboardingHost />
    </div>
  );
}

export default HomeScreen;
