"""Exercise the real silent-input shell using synthetic data and no network."""
import os
import pty
import select
import subprocess
import sys
import termios
import time

launcher = sys.argv[1]
marker = 'SYNTHETIC-PTY-private-value-7193'
url = 'postgresql://postgres:' + marker + '@db.vgsmfbupgydafvotkold.supabase.co:5432/postgres'

for accepted in (True, False):
    master, slave = pty.openpty()
    env = {key: os.environ[key] for key in ('PATH', 'HOME') if key in os.environ}
    child = subprocess.Popen(['/bin/bash', launcher], stdin=slave, stdout=slave, stderr=slave, env=env)
    output = b''

    def until(needle):
        global output
        deadline = time.monotonic() + 10
        while needle not in output:
            assert time.monotonic() < deadline, 'private prompt timed out'
            if select.select([master], [], [], 0.2)[0]:
                output += os.read(master, 65536)

    try:
        until(b'Database URL (hidden):')
        assert not (termios.tcgetattr(slave)[3] & termios.ECHO), 'credential input must not echo'
        value = url if accepted else 'DATABASE_URL=' + url
        os.write(master, (value + '\n').encode())
        until(b'Choose 1, 2, or q:' if accepted else b'Press Return to close.')
        assert marker.encode() not in output, 'synthetic credential leaked'
        assert url.encode() not in output, 'synthetic URL leaked'
        if not accepted:
            assert b'input/INPUT_WRAPPER' in output
            assert b'Choose 1, 2, or q:' not in output
        os.write(master, b'q\n' if accepted else b'\n')
        until(b'Credential cleared from this process.')
        child.wait(timeout=5)
        assert child.returncode == (0 if accepted else 1)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
        os.close(slave)

print('Silent input, safe invalid-input diagnostics, menu boundary, and credential cleanup passed.')
