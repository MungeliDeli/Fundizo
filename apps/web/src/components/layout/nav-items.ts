/**
 * Main navigation. One list drives both the desktop bar and the mobile menu, so they never
 * drift apart. Add items as slices ship (Log in arrives with A-01, Start a fundraiser with C-01).
 */
export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Why trust it', href: '/#trust' },
];
