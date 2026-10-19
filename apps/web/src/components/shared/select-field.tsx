'use client';

import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Campo de selección reutilizable para formularios de catálogo: `Select` de
 * shadcn con etiqueta y opciones tipadas. El nombre accesible lo da el
 * `aria-label` del trigger (los formularios se testean por etiqueta).
 */

export interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectFieldOption[];
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** Marca el trigger con `aria-invalid` cuando hay un error de validación visible. */
  readonly invalid?: boolean;
  readonly className?: string;
}

export function SelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  invalid = false,
  className,
}: SelectFieldProps) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onValueChange(next);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label} aria-invalid={invalid} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
