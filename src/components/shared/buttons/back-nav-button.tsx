import React from "react";
import { ArrowLeft } from "lucide-react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { cn } from "#/utils/utils";
import { formControlBackNavButtonClassName } from "#/utils/form-control-classes";

type BackNavButtonBaseProps = {
  children: React.ReactNode;
  testId?: string;
  className?: string;
};

type BackNavButtonAsButtonProps = BackNavButtonBaseProps & {
  onClick: () => void;
};

type BackNavButtonAsLinkProps = BackNavButtonBaseProps & {
  to: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export type BackNavButtonProps =
  | BackNavButtonAsButtonProps
  | BackNavButtonAsLinkProps;

function BackNavButtonContent({
  children,
}: Pick<BackNavButtonBaseProps, "children">) {
  return (
    <>
      <ArrowLeft size={20} aria-hidden />
      {children}
    </>
  );
}

export function BackNavButton(
  props: BackNavButtonAsLinkProps,
): React.JSX.Element;
export function BackNavButton(
  props: BackNavButtonAsButtonProps,
): React.JSX.Element;
export function BackNavButton(props: BackNavButtonProps) {
  const { children, testId, className } = props;
  const classes = cn(formControlBackNavButtonClassName, className);

  if ("to" in props) {
    return (
      <NavigationLink
        to={props.to}
        onClick={props.onClick}
        data-testid={testId}
        className={classes}
      >
        <BackNavButtonContent>{children}</BackNavButtonContent>
      </NavigationLink>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={testId}
      className={classes}
    >
      <BackNavButtonContent>{children}</BackNavButtonContent>
    </button>
  );
}
