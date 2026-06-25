"use client";

// Native <input type="time"> ignores the `step` attribute on several mobile
// browsers (notably iOS Safari's wheel picker), always scrolling in 1-minute
// increments. This dropdown guarantees 15-minute increments everywhere.
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const period = h < 12 ? "AM" : "PM";
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const label = `${hour12}:${String(m).padStart(2, "0")} ${period}`;
      opts.push({ value, label });
    }
  }
  return opts;
})();

export function TimeSelect({
  id,
  value,
  onChange,
  allowEmpty,
  emptyLabel = "— None —",
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className ?? "block w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {TIME_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
