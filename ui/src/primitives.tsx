import { t as tr } from "./i18n";
import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle, X } from "lucide-react";
export function Button({
  children,
  kind = "secondary",
  icon,
  busy,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "secondary" | "ghost" | "danger";
  icon?: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${kind} ${props.className || ""}`}
      disabled={props.disabled || busy}
    >
      {tr(busy ? <LoaderCircle size={16} className="spin" /> : icon)}
      {tr(children)}
    </button>
  );
}
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`switch-field ${disabled ? "disabled" : ""}`}>
      <span>{tr(label)}</span>
      <button
        type="button"
        className={`switch ${checked ? "checked" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={tr(label)}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span />
      </button>
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    return () => before?.focus?.();
  }, []);
  return (
    <div
      className="modal-shade"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "Tab") {
          const focusable = Array.from(
            modal.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]",
            ) || [],
          );
          const first = focusable[0],
            last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        ref={modal}
        role="dialog"
        aria-modal="true"
        aria-label={tr(title)}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{tr(title)}</h2>
          <Button
            kind="ghost"
            className="icon-button"
            aria-label={tr("关闭")}
            icon={<X size={19} />}
            onClick={onClose}
          />
        </div>
        {tr(children)}
      </section>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {tr(icon)}
      <h3>{tr(title)}</h3>
      <p>{tr(children)}</p>
    </div>
  );
}
export function run(promise: Promise<unknown>) {
  void promise.catch(() => undefined);
}
