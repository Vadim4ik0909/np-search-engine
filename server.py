#!/usr/bin/env python3
"""
Локальний сервер з проксі для API Нової пошти (вирішення проблеми CORS у браузері)
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def load_env():
    env_file = os.path.join(DIRECTORY, '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except Exception as e:
            print(f"Помилка завантаження .env: {e}")

load_env()

def get_server_api_key():
    return os.environ.get('NOVA_POSHTA_API_KEY') or os.environ.get('NP_API_KEY') or ''

class PostalProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/api/status':
            server_key = get_server_api_key()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            resp = json.dumps({'success': True, 'hasServerKey': bool(server_key)}).encode('utf-8')
            self.wfile.write(resp)
            return
        super().do_GET()

    def do_POST(self):
        # Проксі для запитів до Нової пошти
        if self.path == '/api/novaposhta':
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)

            try:
                # Якщо клієнт не передав ключ, але ключ налаштовано на сервері в .env
                server_key = get_server_api_key()
                if server_key:
                    try:
                        data = json.loads(post_body.decode('utf-8'))
                        if not data.get('apiKey'):
                            data['apiKey'] = server_key
                            post_body = json.dumps(data).encode('utf-8')
                    except Exception:
                        pass

                # Робимо запит до сервера Нової пошти безпосередньо з бекенду (без обмежень браузерного CORS)
                req = urllib.request.Request(
                    'https://api.novaposhta.ua/v2.0/json/',
                    data=post_body,
                    headers={'Content-Type': 'application/json'}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    res_body = response.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(res_body)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                err_data = json.dumps({'success': False, 'errors': [str(e)]}).encode('utf-8')
                self.wfile.write(err_data)
        else:
            self.send_error(404, 'Endpoint Not Found')

    def do_OPTIONS(self):
        # Підтримка CORS Preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), PostalProxyHandler) as httpd:
        has_key = "встановлено (приховано)" if get_server_api_key() else "не встановлено (використовується локальна база)"
        print(f"Поштовий сервер запущено на http://localhost:{PORT}")
        print(f"Статус API ключа: {has_key}")
        httpd.serve_forever()
