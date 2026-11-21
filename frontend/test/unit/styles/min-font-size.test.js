import { describe, expect, it } from 'vitest';
import minFontSize, { MIN_FONT_PX } from '../../../src/styles/min-font-size.js';

const run = (value, options) => {
  const decl = { value };
  minFontSize(options).Declaration['font-size'](decl);
  return decl.value;
};

describe('min-font-size postcss plugin', () => {
  it('registers as a postcss plugin named after the project', () => {
    const plugin = minFontSize();
    expect(plugin.postcssPlugin).toBe('draazy-min-font-size');
    expect(minFontSize.postcss).toBe(true);
    expect(MIN_FONT_PX).toBe(12);
  });

  it.each([
    ['10px', '12px'], ['11.5px', '12px'], ['0.5px', '12px'], ['.5px', '12px'], [' 8px ', '12px'],
    ['0.5rem', '0.75rem'], ['0.7rem', '0.75rem'], ['.74rem', '0.75rem'],
  ])('raises %s to the floor as %s', (input, output) => {
    expect(run(input)).toBe(output);
  });

  it.each(['12px', '14px', '0.75rem', '1rem', '1.5rem'])('keeps %s that already meets the floor', (value) => {
    expect(run(value)).toBe(value);
  });

  it.each(['small', 'inherit', '90%', '0.8em', 'var(--x)', 'calc(10px + 1px)', '10pt', '0px', '0rem', '-4px', '', '10 px'])(
    'leaves %j alone', (value) => {
      expect(run(value)).toBe(value);
    },
  );

  it('honours a custom minimum', () => {
    expect(run('14px', { min: 16 })).toBe('16px');
    expect(run('0.9rem', { min: 16 })).toBe('1rem');
    expect(run('16px', { min: 16 })).toBe('16px');
  });
});
