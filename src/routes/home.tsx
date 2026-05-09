import { PrefetchPageLinks } from "react-router";
import { HomeHeader } from "#/components/features/home/home-header/home-header";
import { RepoConnector } from "#/components/features/home/repo-connector";
import { TaskSuggestions } from "#/components/features/home/tasks/task-suggestions";
import { NewConversation } from "#/components/features/home/new-conversation/new-conversation";
import { RecentConversations } from "#/components/features/home/recent-conversations/recent-conversations";

<PrefetchPageLinks page="/conversations/:conversationId" />;

function HomeScreen() {
  return (
    <div
      data-testid="home-screen"
      className="px-0 pt-4 bg-transparent h-full flex flex-col pt-[35px] overflow-y-auto rounded-xl lg:px-[42px] lg:pt-[42px] custom-scrollbar-always"
    >
      <HomeHeader />

      <div className="pt-[25px] flex justify-center">
        <div
          className="flex flex-col gap-5 px-6 sm:max-w-full sm:min-w-full md:flex-row lg:px-0 lg:max-w-[703px] lg:min-w-[703px]"
          data-testid="home-screen-new-conversation-section"
        >
          <RepoConnector />
          <NewConversation />
        </div>
      </div>

      <div className="pt-4 flex sm:justify-start md:justify-center">
        <div
          className="flex flex-col gap-5 px-6 md:flex-row min-w-full md:max-w-full lg:px-0 lg:max-w-[703px] lg:min-w-[703px]"
          data-testid="home-screen-recent-conversations-section"
        >
          <RecentConversations />
          <TaskSuggestions />
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;
