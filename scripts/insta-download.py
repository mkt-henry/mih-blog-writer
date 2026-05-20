"""
Instagram 이미지 수집 스크립트 (instagrapi 사용)

사용법:
  python scripts/insta-download.py @handle output_dir [count]

예시:
  python scripts/insta-download.py @iu_official C:/Users/bpark/AppData/Local/Temp 4

인수:
  @handle     Instagram handle
  output_dir  이미지를 저장할 디렉터리 (handle 이름의 하위 폴더 생성)
  count       수집할 이미지 수 (기본값: 10, 그 중 인물 사진 선별)

출력:
  output_dir/handle/ 아래에 img1.jpg, img2.jpg ... 저장
"""

import sys
import os
import time
import requests
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import LoginRequired

# ── 환경 변수 로드 ────────────────────────────────────────────────────────────
def load_env():
    try:
        with open('.env.local', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass

load_env()

INSTAGRAM_USERNAME = os.environ.get('INSTAGRAM_USERNAME', '')
INSTAGRAM_PASSWORD = os.environ.get('INSTAGRAM_PASSWORD', '')
SESSION_FILE = Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))) / 'instagrapi' / f'session-{INSTAGRAM_USERNAME}.json'

# ── 인수 파싱 ────────────────────────────────────────────────────────────────
handle     = sys.argv[1].lstrip('@') if len(sys.argv) > 1 else None
output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(os.environ.get('TEMP', '/tmp'))
count      = int(sys.argv[3]) if len(sys.argv) > 3 else 10

if not handle:
    print('사용법: python scripts/insta-download.py @handle output_dir [count]')
    sys.exit(1)

save_dir = output_dir / handle
save_dir.mkdir(parents=True, exist_ok=True)

# ── instagrapi 세션 로드/로그인 ──────────────────────────────────────────────
cl = Client()
SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)

def do_login():
    if not INSTAGRAM_USERNAME or not INSTAGRAM_PASSWORD:
        print('오류: .env.local에 INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD 가 없습니다.')
        sys.exit(1)
    print(f'인스타그램 로그인 중... ({INSTAGRAM_USERNAME})', file=sys.stderr)
    cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
    cl.dump_settings(SESSION_FILE)
    print(f'세션 저장: {SESSION_FILE}', file=sys.stderr)

if SESSION_FILE.exists():
    try:
        cl.load_settings(SESSION_FILE)
        cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
        cl.dump_settings(SESSION_FILE)
    except Exception:
        do_login()
else:
    do_login()

# ── 이미지 URL 수집 ──────────────────────────────────────────────────────────
print(f'@{handle} 이미지 수집 중...', file=sys.stderr)
try:
    user = cl.user_info_by_username(handle)
except Exception as e:
    print(f'사용자 조회 실패: {e}', file=sys.stderr)
    sys.exit(1)

print(f'  {user.full_name} | 게시물 {user.media_count}개', file=sys.stderr)
time.sleep(1)

try:
    medias = cl.user_medias_v1(user.pk, amount=max(count * 3, 30))
except Exception as e:
    print(f'미디어 조회 실패: {e}', file=sys.stderr)
    sys.exit(1)

image_urls = []
for m in medias:
    if m.media_type == 1 and m.thumbnail_url:      # 단일 사진
        image_urls.append(str(m.thumbnail_url))
    elif m.media_type == 8 and m.resources:         # 앨범 첫 장
        for r in m.resources:
            if r.thumbnail_url:
                image_urls.append(str(r.thumbnail_url))
                break
    if len(image_urls) >= count:
        break

if not image_urls:
    print('수집된 이미지가 없습니다.', file=sys.stderr)
    sys.exit(1)

print(f'  이미지 URL {len(image_urls)}개 수집', file=sys.stderr)

# ── 이미지 다운로드 ──────────────────────────────────────────────────────────
session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'})

saved = []
for i, url in enumerate(image_urls, 1):
    dest = save_dir / f'img{i}.jpg'
    try:
        r = session.get(url, timeout=30)
        r.raise_for_status()
        dest.write_bytes(r.content)
        print(str(dest))  # stdout에 경로 출력
        saved.append(str(dest))
    except Exception as e:
        print(f'다운로드 실패 [{i}]: {e}', file=sys.stderr)

print(f'저장 완료: {len(saved)}개 → {save_dir}', file=sys.stderr)
