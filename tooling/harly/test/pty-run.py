#!/usr/bin/env python3
"""Run a command under a real pty and stream its output to stdout.

BSD `script` refuses to start when stdin is not itself a tty, which is exactly
the case inside a spawned harness. `pty.spawn` has no such requirement, so it
is the portable way to make `process.stdout.isTTY` true for the child.

    pty-run.py [--send-after SECONDS:BYTES] -- command [args...]
"""
import os
import pty
import select
import subprocess
import sys
import time

send_at = []
argv = sys.argv[1:]
while argv and argv[0].startswith("--"):
    if argv[0] == "--send-after":
        delay, _, data = argv[1].partition(":")
        send_at.append((float(delay), data.encode().decode("unicode_escape").encode()))
        argv = argv[2:]
    elif argv[0] == "--":
        argv = argv[1:]
        break
    else:
        raise SystemExit(f"unknown flag {argv[0]}")

if not argv:
    raise SystemExit("no command given")

pid, fd = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)

start = time.time()
pending = list(send_at)
try:
    while True:
        for delay, data in list(pending):
            if time.time() - start >= delay:
                os.write(fd, data)
                pending.remove((delay, data))
        ready, _, _ = select.select([fd], [], [], 0.05)
        if fd in ready:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
        if not pending:
            finished, status = os.waitpid(pid, os.WNOHANG)
            if finished == pid:
                # Drain whatever the child wrote just before exiting.
                while True:
                    ready, _, _ = select.select([fd], [], [], 0.2)
                    if fd not in ready:
                        break
                    try:
                        chunk = os.read(fd, 4096)
                    except OSError:
                        break
                    if not chunk:
                        break
                    sys.stdout.buffer.write(chunk)
                    sys.stdout.buffer.flush()
                sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else (status >> 8))
except KeyboardInterrupt:
    pass
finally:
    os.close(fd)
