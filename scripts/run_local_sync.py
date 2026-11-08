#!/usr/bin/env python3
"""Run the scheduled catalog worker locally while this process is running."""
import argparse
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8895)
parser.add_argument('--interval', type=int, default=300)
args = parser.parse_args()
if args.interval < 60:
    parser.error('interval must be at least 60 seconds')
with socket.socket() as check:
    try:
        check.bind(('127.0.0.1', args.port))
    except OSError:
        parser.error(f'port {args.port} is already in use')
log_path = root/'.wrangler'/'catalog-sync.log'
log_path.parent.mkdir(parents=True, exist_ok=True)
log_file = log_path.open('a', encoding='utf-8')
worker = subprocess.Popen([str(root/'node_modules/.bin/wrangler'), 'dev', '--config', 'wrangler.sync.toml', '--ip', '127.0.0.1', '--port', str(args.port), '--inspector-port', '0', '--test-scheduled'], cwd=root, stdout=log_file, stderr=subprocess.STDOUT)
stop = False

def request_stop(_signum, _frame):
    global stop
    stop = True

signal.signal(signal.SIGTERM, request_stop)
signal.signal(signal.SIGINT, request_stop)
url = f'http://127.0.0.1:{args.port}/__scheduled?cron=*%2F5+*+*+*+*'
try:
    # Wrangler starts asynchronously; fail visibly if it cannot start.
    for _ in range(60):
        if worker.poll() is not None:
            raise RuntimeError('로컬 동기화 작업자를 시작하지 못했습니다. 포트와 설정을 확인하세요.')
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                if response.status == 200:
                    break
        except (OSError, urllib.error.URLError):
            time.sleep(.5)
    else:
        raise RuntimeError('로컬 동기화 작업자에 연결하지 못했습니다.')
    print(f'로컬 공공데이터 자동 갱신 작업이 실행 중입니다. 로그: {log_path}', flush=True)
    while not stop:
        for _ in range(args.interval):
            if stop or worker.poll() is not None:
                break
            time.sleep(1)
        if stop:
            break
        if worker.poll() is not None:
            raise RuntimeError('로컬 동기화 작업자가 종료됐습니다.')
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                if response.status != 200:
                    print('동기화 요청 실패. 다음 주기에 다시 시도합니다.', file=sys.stderr, flush=True)
        except (OSError, urllib.error.URLError):
            print('동기화 연결 실패. 다음 주기에 다시 시도합니다.', file=sys.stderr, flush=True)
finally:
    worker.terminate()
    try:
        worker.wait(timeout=10)
    except subprocess.TimeoutExpired:
        worker.kill(); worker.wait()
    log_file.close()
