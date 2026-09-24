#!/usr/bin/env python3
"""
The pty allocator `runInPty` (pty.ts) drives.

ARC-07-C8. BSD `script(1)` was driven with Node's default stdio, which is a socketpair on darwin,
and `script` calls `tcgetattr` on ITS OWN stdin to save the terminal state it will restore when the
child exits — a call that only makes sense on a real tty and fails with
`tcgetattr/ioctl: Operation not supported on socket` on anything else. `/dev/null` as stdin avoids
that call but ends stdin immediately, so a prompt can never be answered; a FIFO is still a non-tty
fd and still fails the same call. None of the three shapes measured gave both a working spawn and a
live stdin.

The fix is to stop asking `script(1)` to virtualize a terminal it does not have, and allocate the
pty ourselves: `os.forkpty()` gives the child a REAL pty as its controlling terminal (stdin, stdout
and stderr all point at the slave), with nothing of this process's own stdio involved. This process
never calls `tcgetattr` on anything — it only shuffles bytes between its own stdio (a pipe from
Node, exactly like `script`'s used to be) and the pty's master fd, which is the terminal-shaped
thing the child actually needs.

No dependency: `os`, `pty` and `select` are the standard library, on every POSIX platform this
project supports (Windows has no `pty` module and is not asked to run this — `ptyAvailable()` in
pty.ts is `false` there, and the Windows job in e2e-live.yml only runs `--password-stdin` cases).
"""
import os
import select
import sys


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        sys.stderr.write("pty-driver.py: no command given\n")
        return 2

    pid, master_fd = os.forkpty()
    if pid == 0:
        # The child: its stdin/stdout/stderr are already the pty's slave side.
        try:
            os.execvp(argv[0], argv)
        except OSError as e:
            os.write(2, f"pty-driver.py: exec failed: {e}\n".encode())
        os._exit(127)

    # The parent: relay bytes both ways until the pty has nothing left to say.
    #
    # `stdin_open` stops fd 0 from being polled once Node closes its write side: a closed pipe
    # reads as immediately-readable-with-nothing forever, and leaving it in the select set would
    # spin this loop at 100% CPU instead of blocking on the pty that still has output coming.
    stdin_open = True
    try:
        while True:
            watch = [master_fd] + ([0] if stdin_open else [])
            try:
                readable, _, _ = select.select(watch, [], [])
            except InterruptedError:
                continue

            if master_fd in readable:
                try:
                    chunk = os.read(master_fd, 4096)
                except OSError:
                    # EIO on Linux is how a pty says "the slave side is gone" — not an error here.
                    break
                if not chunk:
                    break
                os.write(1, chunk)

            if stdin_open and 0 in readable:
                try:
                    chunk = os.read(0, 4096)
                except OSError:
                    chunk = b""
                if chunk:
                    try:
                        os.write(master_fd, chunk)
                    except OSError:
                        pass
                else:
                    stdin_open = False
    finally:
        _, status = os.waitpid(pid, 0)

    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


if __name__ == "__main__":
    sys.exit(main())
