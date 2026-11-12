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

/**
 * Capitals (the look so far) or the label as written. Only buttons whose label is
 * set in capitals have a casing: the variants, and a screen's own button that
 * asks for one. The rest (Home's rows, the filter) are left as they are.
 */
export type ButtonCasing = "caps" | "mixed";

/** What a variant without a casing prop gets: being tried as mixed (2026-11-05). */
const DEFAULT_CASING: ButtonCasing = "mixed";

interface Shared {
  variant?: ButtonVariant;
  shortcut?: Shortcut;
  casing?: ButtonCasing;
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
 * column; on a phone the button is as it always was. A key that is no Button's
 * shortcut (Del on Problem words, handled by that screen) is given as a label.
 */
export function Keycap({
  className,
  ...key
}: ({ shortcut: Shortcut } | { label: string }) & { className?: string }) {
  return (
    <kbd className={`${styles.keycap} ${className ?? ""}`} aria-hidden="true">
      {"label" in key ? key.label : keycapLabel(key.shortcut)}
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

/**
 * The attributes a Button adds: its casing for the CSS (a screen's own class can
 * size itself for mixed case), and a shortcut's key to find it by and to announce.
 */
function attributes(
  variant: ButtonVariant | undefined,
  shortcut: Shortcut | undefined,
  casing: ButtonCasing | undefined,
) {
  return {
    "data-casing": casing ?? (variant ? DEFAULT_CASING : undefined),
    ...(shortcut
      ? {
          "data-shortcut": shortcut,
          "aria-keyshortcuts": shortcut.length === 1 ? shortcut.toUpperCase() : shortcut,
        }
      : {}),
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
    const { variant, shortcut, casing, keycap, children, ...rest } = props;
    return (
      <Link {...rest} {...attributes(variant, shortcut, casing)} className={className}>
        {content({ variant, shortcut, keycap, children })}
      </Link>
    );
  }
  if (props.href !== undefined) {
    const { variant, shortcut, casing, keycap, children, ...rest } = props;
    return (
      <a {...rest} {...attributes(variant, shortcut, casing)} className={className}>
        {content({ variant, shortcut, keycap, children })}
      </a>
    );
  }
  const { variant, shortcut, casing, keycap, children, type = "button", ...rest } = props;
  return (
    <button {...rest} {...attributes(variant, shortcut, casing)} type={type} className={className}>
      {content({ variant, shortcut, keycap, children })}
    </button>
  );
}

export default Button;
