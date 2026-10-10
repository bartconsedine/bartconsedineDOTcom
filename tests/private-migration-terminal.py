"""Synthetic Terminal test: no real credential, database, or hosted connection."""
import os, pty, select, subprocess, termios, time
master, slave = pty.openpty()
secret = 'SYNTHETIC-migrate-%#@!$`-7219'
env = {k: os.environ[k] for k in ('PATH', 'HOME') if k in os.environ}
child = subprocess.Popen(['/bin/bash', 'scripts/private-database-migrate.command'], stdin=slave, stdout=slave, stderr=slave, env=env)
output = b''
def until(needle):
    global output
    deadline = time.monotonic() + 10
    while needle not in output:
        assert time.monotonic() < deadline, 'private migration prompt timed out'
        if select.select([master], [], [], 0.2)[0]: output += os.read(master, 65536)
try:
    until(b'Database password (hidden):')
    assert not (termios.tcgetattr(slave)[3] & termios.ECHO)
    os.write(master, (secret+'\n').encode())
    until(b'Choose 1, 2, 3, or q:')
    assert secret.encode() not in output
    os.write(master, b'2\n')
    until(b'Type ADOPT vgsmfbupgydafvotkold')
    os.write(master, b'wrong-project\n')
    until(b'Cancelled; no database command ran.')
    os.write(master, b'q\n')
    until(b'Credential cleared from this process.')
    child.wait(timeout=5)
    assert child.returncode == 0
    assert secret.encode() not in output
    assert termios.tcgetattr(slave)[3] & termios.ECHO
finally:
    if child.poll() is None: child.kill(); child.wait()
    os.close(master); os.close(slave)
print('Hidden password, exact-action cancellation, echo restoration and cleanup passed.')
