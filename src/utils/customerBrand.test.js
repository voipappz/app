import { describe, it, expect } from 'vitest';
import { parseCustomerBrand, brandAccentVars } from './customerBrand';

describe('parseCustomerBrand', () => {
  it('reads logo_icon first, then logo_url', () => {
    expect(parseCustomerBrand({ logo_icon: 'https://x.io/i.png', logo_url: 'https://x.io/l.png' }).logo)
      .toBe('https://x.io/i.png');
    expect(parseCustomerBrand({ logo_url: 'https://x.io/l.png' }).logo).toBe('https://x.io/l.png');
    expect(parseCustomerBrand({ logo_icon: '/images/i.png' }).logo).toBe('/images/i.png');
  });

  it('falls back (null logo) for invalid/garbage logo values', () => {
    expect(parseCustomerBrand({ logo_icon: '' }).logo).toBeNull();
    expect(parseCustomerBrand({ logo_icon: 'not-a-url' }).logo).toBeNull();
    expect(parseCustomerBrand({ logo_icon: 'javascript:alert(1)' }).logo).toBeNull();
    expect(parseCustomerBrand({ logo_icon: 42 }).logo).toBeNull();
    expect(parseCustomerBrand({}).logo).toBeNull();
  });

  it('accepts valid CSS colors and rejects garbage', () => {
    expect(parseCustomerBrand({ logo_color: '#080808' }).color).toBe('#080808');
    expect(parseCustomerBrand({ logo_color: ' #ABC ' }).color).toBe('#ABC');
    expect(parseCustomerBrand({ logo_color: 'rgb(1,2,3)' }).color).toBe('rgb(1,2,3)');
    expect(parseCustomerBrand({ logo_color: 'red; background:url(x)' }).color).toBeNull();
    expect(parseCustomerBrand({ logo_color: '' }).color).toBeNull();
    expect(parseCustomerBrand({}).color).toBeNull();
  });

  it('handles profile as a JSON string', () => {
    const out = parseCustomerBrand('{"logo_icon":"https://x.io/i.png","logo_color":"#fff"}');
    expect(out.logo).toBe('https://x.io/i.png');
    expect(out.color).toBe('#fff');
  });

  it('survives malformed input entirely', () => {
    expect(parseCustomerBrand('{broken json')).toEqual({ logo: null, color: null });
    expect(parseCustomerBrand(null)).toEqual({ logo: null, color: null });
    expect(parseCustomerBrand(undefined)).toEqual({ logo: null, color: null });
    expect(parseCustomerBrand([1, 2])).toEqual({ logo: null, color: null });
  });
});

describe('brandAccentVars', () => {
  it('derives the console accent and the MUI primary from one colour', () => {
    const vars = brandAccentVars('#336699');
    expect(vars['--accent-primary']).toBe('#336699');
    expect(vars['--mui-palette-primary-main']).toBe('#336699');
    expect(vars['--mui-palette-primary-mainChannel']).toBe('51 102 153');
    expect(vars['--accent-primary-alpha-8']).toBe('rgba(51, 102, 153, 0.08)');
    expect(vars['--accent-primary-hover']).toBe(vars['--mui-palette-primary-dark']);
    expect(vars['--mui-palette-primary-contrastText']).toBe('#ffffff');
  });

  it('expands short hex and puts dark text on a light colour', () => {
    const vars = brandAccentVars(' #FE0 ');
    expect(vars['--accent-primary']).toBe('#ffee00');
    expect(vars['--mui-palette-primary-contrastText']).toBe('#1a202c');
  });

  it('returns null for anything that is not a hex colour', () => {
    expect(brandAccentVars('rgb(1,2,3)')).toBeNull();
    expect(brandAccentVars('red; background:url(x)')).toBeNull();
    expect(brandAccentVars('')).toBeNull();
    expect(brandAccentVars(undefined)).toBeNull();
  });
});
