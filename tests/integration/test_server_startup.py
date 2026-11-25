"""Binding failure must exit without touching an existing local service."""
import json
import os
from pathlib import Path
import subprocess
import socket
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[2]

class ExistingService(BaseHTTPRequestHandler):
    def do_GET(self):
        body=b'{"identity":"unrelated-service"}'
        self.send_response(200)
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self,*args):pass

class StartupTests(unittest.TestCase):
    def test_occupied_port_does_not_attach_or_stop_existing_service(self):
        with ThreadingHTTPServer(('127.0.0.1',0),ExistingService,bind_and_activate=False) as existing:
            existing.allow_reuse_address=False
            if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):
                existing.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            existing.server_bind()
            existing.server_activate()
            thread=threading.Thread(target=existing.serve_forever,daemon=True)
            thread.start()
            try:
                with tempfile.TemporaryDirectory(prefix='magnetron_startup_') as directory:
                    env=os.environ|{'MAGNETRON_DATA_DIR':directory,'PYTHONIOENCODING':'utf-8'}
                    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
                        result=subprocess.run([sys.executable,str(ROOT/'backend'/'server.py'),'--port',str(existing.server_port)],cwd=directory,env=env,stdout=out,stderr=err,timeout=15,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                        err.seek(0)
                        error=err.read().decode('utf-8',errors='replace')
                    self.assertNotEqual(result.returncode,0)
                    self.assertIn('server_bind',error)
                    self.assertEqual(list(Path(directory).iterdir()),[])
                    with urllib.request.urlopen(f'http://127.0.0.1:{existing.server_port}/api/health',timeout=3) as response:
                        self.assertEqual(json.load(response),{'identity':'unrelated-service'})
            finally:
                existing.shutdown()
                thread.join(timeout=5)

if __name__=='__main__':unittest.main()
