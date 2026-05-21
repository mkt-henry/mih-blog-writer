"""
Instagram 이미지 수집 스크립트 (instagrapi → instaloader 자동 fallback)

사용법:
  python scripts/insta-download.py @handle output_dir [count]

예시:
  python scripts/insta-download.py @iu_official C:/Users/bpark/AppData/Local/Temp 4

동작:
  1. instagrapi로 시도 → 목표 수 미달이면 instaloader로 보충
  2. instaloader는 instagrapi가 저장한 파일 이후 번호부터 이어서 저장
  3. 둘 다 실패해도 확보된 파일이 있으면 그대로 출력 (중단 안 함)

출력:
  output_dir/handle/ 아래에 img1.jpg, img2.jpg ... 저장
"""

import sys
import os
import time
import shutil
import requests
from pathlib import Path

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

# ── 인수 파싱 ────────────────────────────────────────────────────────────────
handle     = sys.argv[1].lstrip('@') if len(sys.argv) > 1 else None
output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(os.environ.get('TEMP', '/tmp'))
count      = int(sys.argv[3]) if len(sys.argv) > 3 else 10

if not handle:
    print('사용법: python scripts/insta-download.py @handle output_dir [count]')
    sys.exit(1)

save_dir = output_dir / handle
save_dir.mkdir(parents=True, exist_ok=True)

http = requests.Session()
http.headers.update({'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'})

# ── 공통: URL 목록 → 파일 저장 (start_idx부터 번호 매김) ───────────────────
def download_urls(image_urls, start_idx=1):
    saved = []
    for i, url in enumerate(image_urls, start_idx):
        dest = save_dir / f'img{i}.jpg'
        try:
            r = http.get(url, timeout=30)
            r.raise_for_status()
            dest.write_bytes(r.content)
            print(str(dest))
            saved.append(str(dest))
        except Exception as e:
            print(f'다운로드 실패 [{i}]: {e}', file=sys.stderr)
    return saved

# ── 방법 1: instagrapi ───────────────────────────────────────────────────────
def try_instagrapi(need):
    try:
        from instagrapi import Client
    except ImportError:
        print('[instagrapi] 미설치, 건너뜀', file=sys.stderr)
        return []

    SESSION_FILE = (
        Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')))
        / 'instagrapi' / f'session-{INSTAGRAM_USERNAME}.json'
    )
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)

    cl = Client()

    def do_login():
        if not INSTAGRAM_USERNAME or not INSTAGRAM_PASSWORD:
            raise RuntimeError('.env.local에 INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD 없음')
        print(f'[instagrapi] 로그인 중... ({INSTAGRAM_USERNAME})', file=sys.stderr)
        cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
        cl.dump_settings(SESSION_FILE)

    try:
        if SESSION_FILE.exists():
            cl.load_settings(SESSION_FILE)
            cl.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
            cl.dump_settings(SESSION_FILE)
        else:
            do_login()
    except Exception as e:
        print(f'[instagrapi] 로그인 실패: {e}', file=sys.stderr)
        return []

    print(f'[instagrapi] @{handle} 이미지 수집 중...', file=sys.stderr)
    try:
        user = cl.user_info_by_username(handle)
        print(f'  {user.full_name} | 게시물 {user.media_count}개', file=sys.stderr)
        time.sleep(1)
        medias = cl.user_medias_v1(user.pk, amount=max(need * 10, 60))
    except Exception as e:
        print(f'[instagrapi] 미디어 조회 실패: {e}', file=sys.stderr)
        return []

    image_urls = []
    for m in medias:
        url = None
        if m.media_type == 1 and m.thumbnail_url:          # 단일 사진
            url = str(m.thumbnail_url)
        elif m.media_type == 2 and m.thumbnail_url:         # 릴스/동영상 썸네일
            url = str(m.thumbnail_url)
        elif m.media_type == 8 and m.resources:             # 앨범 첫 장
            for r in m.resources:
                if r.thumbnail_url:
                    url = str(r.thumbnail_url)
                    break
        if url:
            image_urls.append(url)
        if len(image_urls) >= need:
            break

    if not image_urls:
        print('[instagrapi] 수집된 이미지 URL 없음', file=sys.stderr)
        return []

    print(f'  이미지 URL {len(image_urls)}개 수집', file=sys.stderr)
    return download_urls(image_urls, start_idx=1)

# ── 방법 2: instaloader ──────────────────────────────────────────────────────
def try_instaloader(need, start_idx=1):
    try:
        import instaloader
    except ImportError:
        print('[instaloader] 미설치, 건너뜀', file=sys.stderr)
        return []

    print(f'[instaloader] @{handle} 이미지 수집 중... (start_idx={start_idx})', file=sys.stderr)

    L = instaloader.Instaloader(
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    # 세션 로드 또는 로그인
    logged_in = False
    # instaloader 기본 세션 경로 시도
    default_session = Path(os.path.expanduser('~')) / '.config' / 'instaloader' / f'session-{INSTAGRAM_USERNAME}'
    local_session   = Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))) / 'instaloader' / f'session-{INSTAGRAM_USERNAME}'

    for sess_path in [local_session, default_session]:
        if sess_path.exists():
            try:
                L.load_session_from_file(INSTAGRAM_USERNAME, str(sess_path))
                print(f'  세션 로드: {sess_path}', file=sys.stderr)
                logged_in = True
                break
            except Exception as e:
                print(f'  세션 로드 실패 ({sess_path}): {e}', file=sys.stderr)

    if not logged_in and INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD:
        try:
            print(f'  로그인 중... ({INSTAGRAM_USERNAME})', file=sys.stderr)
            L.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
            local_session.parent.mkdir(parents=True, exist_ok=True)
            L.save_session_to_file(str(local_session))
            logged_in = True
        except Exception as e:
            print(f'  로그인 실패: {e} — 비로그인으로 시도', file=sys.stderr)

    # 프로필 조회
    try:
        profile = instaloader.Profile.from_username(L.context, handle)
        print(f'  {profile.full_name} | 게시물 {profile.mediacount}개', file=sys.stderr)
    except Exception as e:
        print(f'[instaloader] 프로필 조회 실패: {e}', file=sys.stderr)
        # 로그인 상태에서도 실패하면 재로그인 시도
        if INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD:
            try:
                print('  재로그인 시도 중...', file=sys.stderr)
                L2 = instaloader.Instaloader(
                    download_videos=False, download_video_thumbnails=False,
                    download_geotags=False, download_comments=False,
                    save_metadata=False, compress_json=False, quiet=True,
                )
                L2.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD)
                profile = instaloader.Profile.from_username(L2.context, handle)
                print(f'  {profile.full_name} | 게시물 {profile.mediacount}개', file=sys.stderr)
                L = L2
            except Exception as e2:
                print(f'[instaloader] 재로그인 후에도 실패: {e2}', file=sys.stderr)
                return []
        else:
            return []

    # 임시 폴더에 다운로드 후 img{n}.jpg 로 복사
    tmp_dir = save_dir / '_il_tmp'
    tmp_dir.mkdir(parents=True, exist_ok=True)
    original_dir = Path.cwd()
    os.chdir(tmp_dir)

    saved = []
    try:
        collected = 0
        for post in profile.get_posts():
            if post.is_video:
                continue
            try:
                L.download_post(post, target=str(tmp_dir))
                collected += 1
            except Exception as e:
                print(f'  포스트 다운로드 실패: {e}', file=sys.stderr)
            if collected >= need:
                break
            time.sleep(0.8)
    except Exception as e:
        print(f'[instaloader] 포스트 수집 중 오류: {e}', file=sys.stderr)
    finally:
        os.chdir(original_dir)

    jpgs = sorted(tmp_dir.glob('**/*.jpg'))[:need]
    for offset, src in enumerate(jpgs):
        idx  = start_idx + offset
        dest = save_dir / f'img{idx}.jpg'
        shutil.copy2(src, dest)
        print(str(dest))
        saved.append(str(dest))

    shutil.rmtree(tmp_dir, ignore_errors=True)
    return saved

# ── 실행 ─────────────────────────────────────────────────────────────────────
print(f'@{handle} 이미지 수집 중...', file=sys.stderr)

saved = try_instagrapi(count)

remaining = count - len(saved)
if remaining > 0:
    if saved:
        print(f'[instagrapi] {len(saved)}장 수집 → instaloader로 {remaining}장 추가 시도', file=sys.stderr)
    else:
        print('[instagrapi] 실패 → instaloader로 재시도', file=sys.stderr)
    extra = try_instaloader(remaining, start_idx=len(saved) + 1)
    saved.extend(extra)

if not saved:
    print('이미지 수집 실패: instagrapi·instaloader 모두 실패했습니다.', file=sys.stderr)
    sys.exit(1)

print(f'저장 완료: {len(saved)}개 → {save_dir}', file=sys.stderr)
