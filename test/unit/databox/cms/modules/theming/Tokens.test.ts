import { tokensToCss } from '../../../../../../src/databox/cms/modules/theming/Tokens';

const VALUE = '$value';
const TYPE = '$type';

describe('tokensToCss', (): void => {
  it('flattens nested DTCG tokens into :root custom properties, skipping meta keys.', (): void => {
    const css = tokensToCss({
      color: {
        [TYPE]: 'color',
        primary: { [VALUE]: '#d4af37' },
        surface: { deep: { [VALUE]: '#020617' }},
      },
      space: { sm: { [VALUE]: '8px', [TYPE]: 'dimension' }},
    });
    expect(css).toBe(
      ':root {\n' +
      '  --color-primary: #d4af37;\n' +
      '  --color-surface-deep: #020617;\n' +
      '  --space-sm: 8px;\n' +
      '}\n',
    );
  });
});
