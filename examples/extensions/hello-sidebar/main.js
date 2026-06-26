// Runs inside a Web Worker (no DOM access). Reaches the app only via ctx.agentCanvas.
export function activate(ctx) {
  ctx.agentCanvas.commands.register("hello.say", async () => {
    const convo = await ctx.agentCanvas.conversation.getActive();
    await ctx.agentCanvas.window.showInformationMessage(
      `Hi from the Hello extension! Active conversation: ${convo?.title ?? "none"}`,
    );
  });
}

export function deactivate() {
  // Nothing to clean up; registered command disposables are handled by the runtime.
}
