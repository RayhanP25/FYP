"""
progress.py -- what a long job (saving a recording, an upload, an analysis, a download) is doing now,
so the page can show a progress bar while it waits for the request.

The page picks a job key, sends it with the request and polls GET /api/progress/<key>.
Code deep inside a job (the pose model, drawing the skeleton) reports with step(), which goes to the
job started on the same thread; wrap() carries that job into a helper thread.
"""
import threading
import time

_jobs = {}
_lock = threading.Lock()
_local = threading.local()
KEEP_SECONDS = 600            # finished jobs are forgotten after this


def _prune(now):
    for k in [k for k, j in _jobs.items() if now - j["updated"] > KEEP_SECONDS]:
        del _jobs[k]


def start(key, stages=None):
    """Begin a job on this thread. stages: the step names in order, so the page can show 'step 2 of 5'."""
    now = time.time()
    with _lock:
        _prune(now)
        _jobs[key] = dict(stage="Starting", stages=list(stages or []), done=0, total=0,
                          finished=False, error=None, started=now, updated=now)
    _local.key = key


def current():
    return getattr(_local, "key", None)


def stage(name, total=0, key=None):
    key = key or current()
    if not key:
        return
    with _lock:
        j = _jobs.get(key)
        if j:
            j.update(stage=name, done=0, total=int(total or 0), updated=time.time())


def step(done, total=None, key=None):
    key = key or current()
    if not key:
        return
    with _lock:
        j = _jobs.get(key)
        if j:
            j["done"] = int(done)
            if total is not None:
                j["total"] = int(total)
            j["updated"] = time.time()


def add(n, key=None):
    """Add n to the current count (for work done in several threads, e.g. bytes sent)."""
    key = key or current()
    if not key:
        return
    with _lock:
        j = _jobs.get(key)
        if j:
            j["done"] += int(n)
            j["updated"] = time.time()


def finish(key=None, error=None):
    key = key or current()
    if not key:
        return
    with _lock:
        j = _jobs.get(key)
        if j:
            j.update(finished=True, error=error, updated=time.time())
    if getattr(_local, "key", None) == key:
        _local.key = None


def get(key):
    with _lock:
        j = _jobs.get(key)
        return dict(j) if j else None


def wrap(fn):
    """fn, run on another thread, still reports to the job of the thread that wrapped it."""
    key = current()

    def run(*a, **kw):
        _local.key = key
        try:
            return fn(*a, **kw)
        finally:
            _local.key = None
    return run


class CountingReader:
    """A file object that reports how many bytes have been read from it (used for uploads to storage)."""

    def __init__(self, f, key):
        self.f, self.key = f, key

    def read(self, n=-1):
        b = self.f.read(n)
        add(len(b), self.key)
        return b

    def __getattr__(self, name):
        return getattr(self.f, name)
