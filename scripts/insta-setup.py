"""
Instagram 세션 초기 설정 (최초 1회만 실행)

이 스크립트는 Instagram 계정으로 로그인해 세션 파일을 저장합니다.
저장된 세션은 비밀번호 없이 재사용됩니다.
"""

import instaloader
import getpass
import os

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

username = os.environ.get('INSTAGRAM_USERNAME', '')
if not username:
    username = input('Instagram 아이디: ').strip()

password = getpass.getpass(f'{username} 비밀번호: ')

L = instaloader.Instaloader()
try:
    L.login(username, password)
    L.save_session_to_file()
    from instaloader.instaloader import get_default_session_filename
    print(f'\n세션 저장 완료: {get_default_session_filename(username)}')
    print('이제 instaloader를 비밀번호 없이 사용할 수 있습니다.')
except instaloader.exceptions.BadCredentialsException:
    print('오류: 아이디 또는 비밀번호가 틀렸습니다.')
except instaloader.exceptions.TwoFactorAuthRequiredException:
    code = input('2단계 인증 코드: ').strip()
    L.two_factor_login(code)
    L.save_session_to_file()
    print('세션 저장 완료.')
