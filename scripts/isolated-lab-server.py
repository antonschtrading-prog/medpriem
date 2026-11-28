from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import functools
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()
ThreadingHTTPServer(("127.0.0.1",8765),functools.partial(Handler,directory="site")).serve_forever()
