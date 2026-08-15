import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_MAX,
  ENTITY_KINDS,
  EDGE_RELS,
  expiryFor,
  claimKindFor,
  normalizePayload,
} from '../scripts/lib/kb.mjs';

const TODAY = '2026-08-16';

describe('ENTITY_KINDS / EDGE_RELS', () => {
  it('covers the spec node kinds', () => {
    expect(ENTITY_KINDS).toEqual([
      'person', 'group', 'agency', 'song', 'program', 'award', 'event_type', 'genre',
    ]);
  });

  it('covers the spec relations', () => {
    expect(EDGE_RELS).toEqual([
      'member_of', 'signed_to', 'released', 'appeared_in', 'won', 'performed_at',
      'similar_to', 'has_genre',
    ]);
  });
});

describe('expiryFor', () => {
  it('expires agency and group membership in 6 months', () => {
    expect(expiryFor('agency', TODAY)).toBe('2027-02-16');
    expect(expiryFor('membership', TODAY)).toBe('2027-02-16');
  });

  it('expires activity facts in 3 months', () => {
    expect(expiryFor('activity', TODAY)).toBe('2026-11-16');
    expect(expiryFor('recent', TODAY)).toBe('2026-11-16');
  });

  it('never expires immutable facts', () => {
    expect(expiryFor('debut', TODAY)).toBeNull();
    expect(expiryFor('song', TODAY)).toBeNull();
    expect(expiryFor('award', TODAY)).toBeNull();
    expect(expiryFor('past_event', TODAY)).toBeNull();
  });

  it('treats an unknown topic as immutable rather than guessing', () => {
    expect(expiryFor('무엇인가', TODAY)).toBeNull();
  });
});

describe('claimKindFor', () => {
  it('accepts tier 1-3 as plain facts', () => {
    expect(claimKindFor(1)).toBe('fact');
    expect(claimKindFor(2)).toBe('fact');
    expect(claimKindFor(3)).toBe('fact');
  });

  it('marks tier 4 as needs-check', () => {
    expect(claimKindFor(4)).toBe('needs-check');
  });

  it('refuses tier 5 outright', () => {
    expect(claimKindFor(5)).toBeNull();
  });
});

describe('normalizePayload', () => {
  const base = () => ({
    sources: [{ ref: 'ig', url: 'https://instagram.com/x', tier: 1, snapshot: 'a'.repeat(70000) }],
    entities: [{ ref: 'p', kind: 'person', name: '아이유', keyword_id: 'k1' }],
    edges: [{ src: 'p', dst: 'g', rel: 'has_genre' }],
    claims: [{ entity: 'p', claim: '소속사는 이담', source: 'ig', quote: '이담엔터', topic: 'agency' }],
    signals: [{ entity: 'p', metric: 'instagram_followers', value: 320000 }],
  });

  it('truncates the snapshot to the cap', () => {
    const out = normalizePayload(base(), TODAY);
    expect(out.sources[0].snapshot).toHaveLength(SNAPSHOT_MAX);
  });

  it('applies the expiry default from the claim topic', () => {
    const out = normalizePayload(base(), TODAY);
    expect(out.claims[0].expires_on).toBe('2027-02-16');
  });

  it('keeps an explicit expires_on over the default', () => {
    const p = base();
    p.claims[0].expires_on = '2026-12-31';
    expect(normalizePayload(p, TODAY).claims[0].expires_on).toBe('2026-12-31');
  });

  it('always loads claims as draft even if the caller says verified', () => {
    const p = base();
    p.claims[0].status = 'verified';
    expect(normalizePayload(p, TODAY).claims[0].status).toBe('draft');
  });

  it('drops tier 5 sources and every claim resting on them', () => {
    const p = base();
    p.sources[0].tier = 5;
    const out = normalizePayload(p, TODAY);
    expect(out.sources).toHaveLength(0);
    expect(out.claims).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('tier 5');
  });

  it('marks claims from tier 4 sources as needs-check', () => {
    const p = base();
    p.sources[0].tier = 4;
    expect(normalizePayload(p, TODAY).claims[0].kind).toBe('needs-check');
  });

  it('rejects an unknown entity kind instead of writing it', () => {
    const p = base();
    p.entities[0].kind = '가수님';
    const out = normalizePayload(p, TODAY);
    expect(out.entities).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('kind');
  });

  it('rejects an unknown relation', () => {
    const p = base();
    p.edges[0].rel = '친함';
    const out = normalizePayload(p, TODAY);
    expect(out.edges).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('rel');
  });

  it('requires keyword_id on a person entity', () => {
    const p = base();
    delete p.entities[0].keyword_id;
    const out = normalizePayload(p, TODAY);
    expect(out.entities).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('keyword_id');
  });

  it('does not require keyword_id on non-person entities', () => {
    const p = base();
    p.entities[0] = { ref: 'g', kind: 'genre', name: '발라드' };
    expect(normalizePayload(p, TODAY).entities).toHaveLength(1);
  });

  it('drops a claim with no quote — it can never be verified', () => {
    const p = base();
    delete p.claims[0].quote;
    const out = normalizePayload(p, TODAY);
    expect(out.claims).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('quote');
  });

  it('drops a signal with no numeric value rather than storing zero', () => {
    const p = base();
    p.signals[0].value = null;
    const out = normalizePayload(p, TODAY);
    expect(out.signals).toHaveLength(0);
  });

  it('refuses any signal or claim that looks like a fee amount', () => {
    const p = base();
    p.signals.push({ entity: 'p', metric: 'fee_estimate', value: 5000000 });
    p.claims.push({ entity: 'p', claim: '출연료는 500만원 수준', source: 'ig', quote: '500만원', topic: 'fee' });
    const out = normalizePayload(p, TODAY);
    expect(out.signals.some((s) => s.metric === 'fee_estimate')).toBe(false);
    expect(out.claims.some((c) => c.claim.includes('출연료'))).toBe(false);
    expect(out.rejected.join(' ')).toContain('출연료');
  });
});
