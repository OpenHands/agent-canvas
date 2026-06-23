export function TaskItemTitle({ children: title }: React.PropsWithChildren) {
  return (
    <div className="py-3">
      <h3 className="text-xs text-foreground leading-6 font-normal">{title}</h3>
    </div>
  );
}
