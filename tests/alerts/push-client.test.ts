import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resyncPushSubscription } from '@/lib/push-client';

// 2026-10-24: 서버 쪽 구독 목록이 0건이라 알림이 한 건도 안 나갔는데, 기기 버튼은 "알림 끄기"(켜짐)로 보였다.
// 앱을 열 때마다 이 기기의 구독을 서버에 다시 올려 어긋남이 남지 않게 한다.

type FakeSub = { toJSON: () => unknown };

function fakeReg(existing: FakeSub | null) {
  const created: FakeSub = { toJSON: () => ({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } }) };
  const subscribe = vi.fn(async () => created);
  return {
    reg: { pushManager: { getSubscription: vi.fn(async () => existing), subscribe } } as unknown as ServiceWorkerRegistration,
    subscribe,
  };
}

describe('resyncPushSubscription', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { PushManager: function () {}, Notification: function () {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('알림을 허용한 기기의 기존 구독을 서버에 다시 올린다', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    const existing: FakeSub = { toJSON: () => ({ endpoint: 'https://push.example/old', keys: { p256dh: 'p', auth: 'a' } }) };
    const { reg, subscribe } = fakeReg(existing);

    await resyncPushSubscription(reg);

    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/push');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).endpoint).toBe('https://push.example/old');
  });

  it('허용은 했는데 구독이 사라졌으면 새로 만들어 올린다', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    const { reg, subscribe } = fakeReg(null);

    await resyncPushSubscription(reg);

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).endpoint).toBe('https://push.example/new');
  });

  it('알림을 허용하지 않은 기기는 아무것도 하지 않는다(권한 창도 띄우지 않는다)', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    const { reg, subscribe } = fakeReg(null);

    await resyncPushSubscription(reg);

    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('서버 등록이 실패하면 오류로 알린다', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    const { reg } = fakeReg({ toJSON: () => ({}) });

    await expect(resyncPushSubscription(reg)).rejects.toThrow('500');
  });
});
