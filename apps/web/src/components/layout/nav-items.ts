/**
 * Main navigation. One list drives both the desktop bar and the mobile menu, so they never
 * drift apart. "Start a fundraiser" and account links are added by the header itself.
 */
export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Why trust it', href: '/#trust' },
];
