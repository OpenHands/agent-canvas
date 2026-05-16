import { CreateInstructions } from "./create-instructions";

export function EmptyState() {
  return (
    <div className="flex w-full flex-col">
      <CreateInstructions />
    </div>
  );
}
