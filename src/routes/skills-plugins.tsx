import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";

export default function SkillsPluginsScreen() {
  return (
    <div
      data-testid="skills-plugins-screen"
      className="flex h-full gap-10"
    >
      <ExtensionsNavigation />
      <section className="flex-1 min-w-0 overflow-auto custom-scrollbar-always pr-[14px] pt-8">
        <div className="min-w-0 space-y-1 mb-4">
          <h2 className="text-xl font-semibold leading-6 text-foreground">Plugins</h2>
          <div className="max-w-2xl text-sm text-tertiary-light">
            Plugin configuration options will appear here.
          </div>
        </div>
      </section>
    </div>
  );
}
