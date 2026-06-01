import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAdminUsername,
  canView,
  canEdit,
  visibleAgencies,
  type UserPermissions,
} from '@/lib/permissions';

function mkPerms(over: Partial<UserPermissions> = {}): UserPermissions {
  return {
    userId: 'u1',
    username: 'someone',
    isAdmin: false,
    agencies: { mih_speaker: null, mih_casting: null, mih_agency: null, other: null },
    ...over,
  };
}

describe('isAdminUsername', () => {
  const original = process.env.ADMIN_USERNAMES;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = original;
  });

  it('returns true for default admin when env unset', () => {
    delete process.env.ADMIN_USERNAMES;
    expect(isAdminUsername('bpark0718')).toBe(true);
    expect(isAdminUsername('other')).toBe(false);
  });

  it('uses ADMIN_USERNAMES env (comma separated)', () => {
    process.env.ADMIN_USERNAMES = 'alice, bob ,charlie';
    expect(isAdminUsername('alice')).toBe(true);
    expect(isAdminUsername('bob')).toBe(true);
    expect(isAdminUsername('charlie')).toBe(true);
    expect(isAdminUsername('bpark0718')).toBe(false);
  });
});

describe('canView', () => {
  it('returns true when agency role is view', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'view', mih_casting: null, mih_agency: null, other: null } });
    expect(canView(p, 'mih_speaker')).toBe(true);
  });

  it('returns true when agency role is editor', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'editor', mih_casting: null, mih_agency: null, other: null } });
    expect(canView(p, 'mih_speaker')).toBe(true);
  });

  it('returns false when agency role is null', () => {
    const p = mkPerms();
    expect(canView(p, 'mih_speaker')).toBe(false);
  });
});

describe('canEdit', () => {
  it('returns true only for editor', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'editor', mih_casting: 'view', mih_agency: null, other: null } });
    expect(canEdit(p, 'mih_speaker')).toBe(true);
    expect(canEdit(p, 'mih_casting')).toBe(false);
    expect(canEdit(p, 'mih_agency')).toBe(false);
  });
});

describe('visibleAgencies', () => {
  it('returns only agencies with non-null role', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'view', mih_casting: null, mih_agency: 'editor', other: null } });
    expect(visibleAgencies(p)).toEqual(['mih_speaker', 'mih_agency']);
  });

  it('returns empty when no permissions', () => {
    expect(visibleAgencies(mkPerms())).toEqual([]);
  });

  it('preserves AGENCY_SLUGS order', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'view', mih_casting: 'view', mih_agency: 'view', other: 'view' } });
    expect(visibleAgencies(p)).toEqual(['mih_speaker', 'mih_casting', 'mih_agency', 'other']);
  });
});
