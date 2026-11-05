import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";

/*
 * Every action in the app: a button, a link to another screen (`to`), or a link
 * out (`href`). The shared looks are variants — primary, the solid block at the
 * foot of a screen; pill, an outlined way into practice with a chevron after;
 * back, the quiet link above a title with a chevron before. Anything else keeps
 * its own look through className. Choice controls (modes, categories, options,
 * tiles) are not actions and stay plain buttons.
 */

export type ButtonVariant = "primary" | "pill" | "back";

interface Shared {
  variant?: ButtonVariant;
  children?: ReactNode;
}

type AsButton = Shared & ButtonHTMLAttributes<HTMLButtonElement> & { to?: never; href?: never };
type AsLink = Shared & LinkProps;
type AsAnchor = Shared & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; to?: never };

export type ButtonProps = AsButton | AsLink | AsAnchor;

function Chevron({ path }: { path: string }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function content(variant: ButtonVariant | undefined, children: ReactNode) {
  if (variant === "back") {
    return (
      <>
        <Chevron path="M13 4l-6 6 6 6" />
        {children}
      </>
    );
  }
  if (variant === "pill") {
    return (
      <>
        {children}
        <Chevron path="M7 4l6 6-6 6" />
      </>
    );
  }
  return children;
}

// One signature per element, so handlers like onMouseDown get their event type.
function Button(props: AsButton): ReactNode;
function Button(props: AsLink): ReactNode;
function Button(props: AsAnchor): ReactNode;
function Button(props: ButtonProps) {
  const classes = [props.variant ? styles[props.variant] : "", props.className ?? ""]
    .filter(Boolean)
    .join(" ");
  const className = classes || undefined;

  if (props.to !== undefined) {
    const { variant, children, ...rest } = props;
    return (
      <Link {...rest} className={className}>
        {content(variant, children)}
      </Link>
    );
  }
  if (props.href !== undefined) {
    const { variant, children, ...rest } = props;
    return (
      <a {...rest} className={className}>
        {content(variant, children)}
      </a>
    );
  }
  const { variant, children, type = "button", ...rest } = props;
  return (
    <button {...rest} type={type} className={className}>
      {content(variant, children)}
    </button>
  );
}

export default Button;
