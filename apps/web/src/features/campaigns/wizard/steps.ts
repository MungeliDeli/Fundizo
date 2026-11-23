export const WIZARD_STEPS = [
  { id: 'who', label: 'Who it’s for' },
  { id: 'category', label: 'What it’s for' },
  { id: 'goal', label: 'Goal and place' },
  { id: 'story', label: 'Story' },
  { id: 'review', label: 'Review and publish' },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]['id'];

export function isWizardStep(value: string): value is WizardStep {
  return WIZARD_STEPS.some((s) => s.id === value);
}

export function stepHref(id: string, step: WizardStep): string {
  return `/start/${id}/${step}`;
}

export function nextStep(step: WizardStep): WizardStep {
  const i = WIZARD_STEPS.findIndex((s) => s.id === step);
  return WIZARD_STEPS[Math.min(i + 1, WIZARD_STEPS.length - 1)]?.id ?? 'review';
}

export function previousStep(step: WizardStep): WizardStep | null {
  const i = WIZARD_STEPS.findIndex((s) => s.id === step);
  return i > 0 ? (WIZARD_STEPS[i - 1]?.id ?? null) : null;
}
