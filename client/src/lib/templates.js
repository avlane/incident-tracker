// Fills the "open an incident" form from a template. Only empty fields are
// filled, so choosing a template after typing never overwrites your words.
export function applyTemplateToForm(form, template) {
  if (!template) return form;
  return {
    ...form,
    title: form.title.trim() === '' ? template.title : form.title,
    summary: form.summary.trim() === '' ? template.summary : form.summary,
    // severity always has a value in the form (default sev3), so the template wins
    // only while the form still shows the default
    severity: form.severity === 'sev3' && template.severity ? template.severity : form.severity,
    serviceIds:
      form.serviceIds.length === 0 ? [...new Set(template.affected.map((a) => a.serviceId))] : form.serviceIds,
    templateId: template.id,
  };
}

export const templateById = (templates, id) => templates.find((t) => t.id === id) ?? null;
