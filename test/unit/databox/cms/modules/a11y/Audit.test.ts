import type { A11yInput } from '../../../../../../src/databox/cms/modules/a11y/Audit';
import { auditAccessibility } from '../../../../../../src/databox/cms/modules/a11y/Audit';

describe('auditAccessibility', (): void => {
  it('reports ok with no issues when media has alt text and controls have labels.', (): void => {
    const input: A11yInput = {
      media: [
        { type: 'image', alt: 'A description' },
      ],
      controls: [
        { kind: 'button', label: 'Submit' },
      ],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [], ok: true });
  });

  it('reports an issue for an image with no alt text.', (): void => {
    const input: A11yInput = {
      media: [
        { type: 'image' },
      ],
      controls: [],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [ 'image #0 missing alt text' ], ok: false });
  });

  it('reports an issue for an image with blank alt text.', (): void => {
    const input: A11yInput = {
      media: [
        { type: 'image', alt: '   ' },
      ],
      controls: [],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [ 'image #0 missing alt text' ], ok: false });
  });

  it('does not report an issue for a non-image with no alt text.', (): void => {
    const input: A11yInput = {
      media: [
        { type: 'video' },
      ],
      controls: [],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [], ok: true });
  });

  it('reports an issue for a control with no label.', (): void => {
    const input: A11yInput = {
      media: [],
      controls: [
        { kind: 'button' },
      ],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [ 'control #0 (button) missing label' ], ok: false });
  });

  it('reports an issue for a control with blank label.', (): void => {
    const input: A11yInput = {
      media: [],
      controls: [
        { kind: 'button', label: '   ' },
      ],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [ 'control #0 (button) missing label' ], ok: false });
  });

  it('does not report an issue for a control with a label.', (): void => {
    const input: A11yInput = {
      media: [],
      controls: [
        { kind: 'button', label: 'Submit' },
      ],
    };
    expect(auditAccessibility(input)).toEqual({ issues: [], ok: true });
  });
});
