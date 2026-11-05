import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";
import { keycapLabel, type Shortcut } from "./shortcuts.ts";

/*
 * Every action in the app: a button, a link to another screen (`to`), or a link
 * out (`href`). The shared looks are variants — primary, the solid block at the
 * foot of a screen, and secondary, its outlined partner; pill, an outlined way
 * into practice with a chevron after; back, the quiet link above a title with a
 * chevron before. Anything else keeps
 * its own look through className. Choice controls (modes, categories, options,
 * tiles) are not actions and stay plain buttons.
 *
 * A shortcut (see shortcuts.ts) makes the button answer a key, and on a computer
 * shows the key as a keycap after the label (canvas board B). Where the end of the
 * button is the wrong place, keycap={false} leaves the caller to put a <Keycap>;
 * where a keycap is only noise (Home), it leaves none and the key still works.
 */

export type ButtonVariant = "primary" | "secondary" | "pill" | "back";

interface Shared {
  variant?: ButtonVariant;
  shortcut?: Shortcut;
  /** False for no keycap (the key still works), or to place a <Keycap> among the children. */
  keycap?: boolean;
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

/**
 * A key, drawn as a keycap. Shown only in a window wide enough for the whole
 * column; on a phone the button is as it always was.
 */
export function Keycap({ shortcut, className }: { shortcut: Shortcut; className?: string }) {
  return (
    <kbd className={`${styles.keycap} ${className ?? ""}`} aria-hidden="true">
      {keycapLabel(shortcut)}
    </kbd>
  );
}

function content({ variant, shortcut, keycap = true, children }: Shared) {
  const key = shortcut && keycap ? <Keycap shortcut={shortcut} /> : null;
  if (variant === "back") {
    return (
      <>
        <Chevron path="M13 4l-6 6 6 6" />
        {children}
        {key}
      </>
    );
  }
  if (variant === "pill") {
    return (
      <>
        {children}
        {key}
        <Chevron path="M7 4l6 6-6 6" />
      </>
    );
  }
  return (
    <>
      {children}
      {key}
    </>
  );
}

/** The attributes a shortcut adds: the key to find it by, and the key for assistive tech. */
function shortcutAttributes(shortcut: Shortcut | undefined) {
  if (!shortcut) return {};
  return {
    "data-shortcut": shortcut,
    "aria-keyshortcuts": shortcut.length === 1 ? shortcut.toUpperCase() : shortcut,
  };
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
    const { variant, shortcut, keycap, children, ...rest } = props;
    return (
      <Link {...rest} {...shortcutAttributes(shortcut)} className={className}>
        {content({ variant, shortcut, keycap, children })}
      </Link>
    );
  }
  if (props.href !== undefined) {
    const { variant, shortcut, keycap, children, ...rest } = props;
    return (
      <a {...rest} {...shortcutAttributes(shortcut)} className={className}>
        {content({ variant, shortcut, keycap, children })}
      </a>
    );
  }
  const { variant, shortcut, keycap, children, type = "button", ...rest } = props;
  return (
    <button {...rest} {...shortcutAttributes(shortcut)} type={type} className={className}>
      {content({ variant, shortcut, keycap, children })}
    </button>
  );
}

export default Button;
