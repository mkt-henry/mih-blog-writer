// middleware(Edge Runtime)와 서버(Node Runtime) 양쪽에서 공유 가능한 상수만 둔다.
// Node 전용 모듈(crypto, fs 등)을 import하면 안 됨.

export const SESSION_COOKIE_NAME = "mih_session";
