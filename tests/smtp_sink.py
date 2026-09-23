"""Test-only SMTP sink: stores every received message as <n>.eml in the given directory.

Usage: smtp_sink.py DIR PORT [--tls CERT KEY] [--auth USER:PASS] [--fail-rcpt]
  --tls        implicit TLS (like smtp.gmail.com:465), certificate trusted by the client via NODE_EXTRA_CA_CERTS
  --auth       require AUTH LOGIN/PLAIN with these credentials
  --fail-rcpt  answer 451 (temporary failure) to every recipient — for retry tests
"""
import asyncio, os, sys, itertools, ssl
from aiosmtpd.controller import Controller
from aiosmtpd.smtp import AuthResult, LoginPassword

class Sink:
    def __init__(self, directory, fail_rcpt=False):
        self.directory = directory
        self.counter = itertools.count(1)
        self.fail_rcpt = fail_rcpt
    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        if self.fail_rcpt:
            return "451 4.3.0 Temporary failure (test)"
        envelope.rcpt_tos.append(address)
        return "250 OK"
    async def handle_DATA(self, server, session, envelope):
        n = next(self.counter)
        with open(os.path.join(self.directory, f"{n:04d}.eml"), "wb") as f:
            f.write(b"X-Envelope-From: " + envelope.mail_from.encode() + b"\r\n")
            f.write(b"X-Envelope-To: " + ",".join(envelope.rcpt_tos).encode() + b"\r\n")
            f.write(envelope.original_content)
        return "250 OK queued as test-%d" % n

def make_auth(user, password):
    def authenticator(server, session, envelope, mechanism, auth_data):
        if isinstance(auth_data, LoginPassword) and auth_data.login.decode() == user and auth_data.password.decode() == password:
            return AuthResult(success=True)
        return AuthResult(success=False, handled=False)
    return authenticator

if __name__ == "__main__":
    args = sys.argv[1:]
    directory, port = args[0], int(args[1])
    os.makedirs(directory, exist_ok=True)
    kwargs = {"hostname": "127.0.0.1", "port": port}
    if "--tls" in args:
        i = args.index("--tls")
        ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ctx.load_cert_chain(args[i + 1], args[i + 2])
        kwargs["ssl_context"] = ctx
    if "--auth" in args:
        user, password = args[args.index("--auth") + 1].split(":", 1)
        kwargs["authenticator"] = make_auth(user, password)
        kwargs["auth_require_tls"] = "--tls" not in args and False
        kwargs["auth_required"] = True
    c = Controller(Sink(directory, "--fail-rcpt" in args), **kwargs)
    c.start()
    print(f"smtp sink 127.0.0.1:{port} -> {directory}", flush=True)
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        c.stop()
