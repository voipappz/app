import { describe, it, expect } from 'vitest';
import { titleForRole } from './sessionTitle';

describe('titleForRole', () => {
  it('puts the role first, so it shows in a narrow tab', () => {
    expect(titleForRole('voipappz', 'admin')).toBe('Admin · voipappz');
    expect(titleForRole('voipappz', 'user')).toBe('User · voipappz');
  });
  it('replaces a previous role instead of stacking them', () => {
    expect(titleForRole('User · Acme', 'admin')).toBe('Admin · Acme');
    expect(titleForRole('Admin · Acme', 'admin')).toBe('Admin · Acme');
  });
  it('drops the role when nobody is signed in', () => {
    expect(titleForRole('Admin · Acme', null)).toBe('Acme');
  });
});
