export interface MediaItem { readonly type: string; readonly alt?: string }
export interface Control { readonly kind: string; readonly label?: string }
export interface A11yInput { readonly media: readonly MediaItem[]; readonly controls: readonly Control[] }
export interface A11yResult { readonly issues: string[]; readonly ok: boolean }

export function auditAccessibility(input: A11yInput): A11yResult {
  const issues: string[] = [];

  for (let i = 0; i < input.media.length; i++) {
    const item = input.media[i];
    if (item.type === 'image' && (item.alt === undefined || item.alt.trim().length === 0)) {
      issues.push(`image #${i} missing alt text`);
    }
  }

  for (let i = 0; i < input.controls.length; i++) {
    const control = input.controls[i];
    if (control.label === undefined || control.label.trim().length === 0) {
      issues.push(`control #${i} (${control.kind}) missing label`);
    }
  }

  return { issues, ok: issues.length === 0 };
}
