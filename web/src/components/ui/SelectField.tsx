import type { ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  helperText?: ReactNode;
  className?: string;
  id: string;
};

/** Shared, accessible select field used by workspace context controls. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  helperText,
  className = "",
  id
}: SelectFieldProps) {
  const helperId = helperText ? `${id}-help` : undefined;

  return (
    <label className={`context-select ${className}`.trim()} htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={helperId}
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && <small className="field-helper" id={helperId}>{helperText}</small>}
    </label>
  );
}
