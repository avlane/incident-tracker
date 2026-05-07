// Props that tie an input to its error message, so a screen reader announces
// the problem when the field gets focus (aria-describedby) and knows the field
// is invalid (aria-invalid).

export const errorId = (form, field) => `${form}-${field}-error`;

export function fieldProps(form, field, errors) {
  if (!errors[field]) return {};
  return { 'aria-invalid': true, 'aria-describedby': errorId(form, field) };
}

// The first field with an error, in the order the form shows them, so focus
// can move there after a failed submit.
export function firstInvalid(fieldOrder, errors) {
  return fieldOrder.find((field) => errors[field]) ?? null;
}
