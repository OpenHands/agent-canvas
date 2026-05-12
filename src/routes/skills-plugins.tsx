import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { Typography } from "#/ui/typography";

export default function SkillsPluginsScreen() {
  return (
    <main
      data-testid="skills-plugins-screen"
      className="flex h-full overflow-hidden gap-10 px-[14px] pt-8"
    >
      <ExtensionsNavigation />
      <section className="flex-1 min-w-0 overflow-auto custom-scrollbar-always">
        <div className="max-w-3xl flex flex-col gap-3">
          <Typography.H2>Plugins</Typography.H2>
          <Typography.Text className="text-sm text-content-muted">
            Plugin configuration options will appear here.
          </Typography.Text>
        </div>
      </section>
    </main>
  );
}
