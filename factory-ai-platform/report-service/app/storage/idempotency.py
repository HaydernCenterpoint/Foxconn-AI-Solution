import json
import os
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

STALE_AFTER_SECONDS = max(1, int(os.getenv("REPORT_EXPORT_STALE_SECONDS", "900")))
_GUARD_TIMEOUT_SECONDS = 1.0
_GUARD_RETRY_SECONDS = 0.01


class ExportStoreError(RuntimeError):
    """The idempotency state cannot be read or persisted safely."""


class LeaseLostError(ExportStoreError):
    """The caller no longer owns the export lease."""


class ExportStore:
    def __init__(self, root: Path):
        self.root = root / ".exports"

    @staticmethod
    def token(key: str) -> str:
        import hashlib

        return hashlib.sha256(key.encode("utf-8")).hexdigest()

    def read(self, key: str) -> dict[str, Any] | None:
        return self._read_path(self._record_path(key))

    def read_token(self, token: str) -> dict[str, Any] | None:
        if len(token) != 64 or any(char not in "0123456789abcdef" for char in token):
            raise ExportStoreError("report export token is invalid")
        return self._read_path(self.root / f"{token}.json")

    @staticmethod
    def _read_path(path: Path) -> dict[str, Any] | None:
        try:
            contents = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise ExportStoreError("report export state is unavailable") from exc
        try:
            record = json.loads(contents)
        except (OSError, ValueError) as exc:
            raise ExportStoreError("report export state is corrupt") from exc
        if (
            not isinstance(record, dict)
            or record.get("status") not in {"in_progress", "success", "failed"}
            or not isinstance(record.get("idempotencyKey"), str)
            or not isinstance(record.get("requestHash"), str)
            or not isinstance(record.get("reconciliationUrl"), str)
            or not isinstance(record.get("ownerTenant"), str)
            or not isinstance(record.get("ownerUser"), str)
        ):
            raise ExportStoreError("report export state is corrupt")
        return record

    def write(self, key: str, record: dict[str, Any]) -> None:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ExportStoreError("report export state is unavailable") from exc
        self._write_path(self._record_path(key), record)

    @staticmethod
    def _write_path(destination: Path, record: dict[str, Any]) -> None:
        temporary = destination.with_name(f"{destination.name}.tmp-{uuid.uuid4().hex}")
        try:
            temporary.write_text(
                json.dumps(record, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            os.replace(temporary, destination)
        except OSError as exc:
            raise ExportStoreError("report export state is unavailable") from exc
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

    def fail_if_unclaimed(self, key: str, record: dict[str, Any]) -> dict[str, Any]:
        """Persist an orphan failure only if no lease owns the in-progress record."""
        with self._guard(key):
            if self._lock_path(key).exists():
                current = self.read(key)
                return current if current is not None else record
            current = self.read(key)
            if current is None or current.get("status") != "in_progress":
                return current if current is not None else record
            self._write_path(self._record_path(key), record)
            return record

    def claim(self, key: str) -> str | None:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ExportStoreError("report export state is unavailable") from exc
        owner = uuid.uuid4().hex
        lock_path = self._lock_path(key)
        with self._guard(key):
            if lock_path.exists():
                self._lock_owner(lock_path)
                return None
            try:
                lock_path.mkdir()
                (lock_path / owner).touch(exist_ok=False)
            except OSError as exc:
                try:
                    lock_path.rmdir()
                except OSError:
                    pass
                raise ExportStoreError("report export state is unavailable") from exc
        return owner

    def release(self, key: str, owner: str) -> None:
        with self._guard(key):
            path = self._lock_path(key)
            if not path.exists():
                return
            if self._lock_owner(path) == owner:
                self._unlink_if_owned(path, owner)

    def refresh(self, key: str, owner: str) -> bool:
        path = self._lock_path(key)
        with self._guard(key):
            if not path.exists():
                return False
            if self._lock_owner(path) != owner:
                return False
            marker = path / owner
            try:
                os.utime(marker, None)
                os.utime(path, None)
            except FileNotFoundError:
                return False
            except OSError as exc:
                raise ExportStoreError("report export state is unavailable") from exc
            return marker.is_file()

    @contextmanager
    def ownership(self, key: str, owner: str) -> Iterator[None]:
        """Hold the key guard while a lease owner publishes and commits state."""
        with self._guard(key):
            path = self._lock_path(key)
            if not path.exists() or self._lock_owner(path) != owner:
                raise LeaseLostError("report export lease ownership was lost")
            yield

    @contextmanager
    def heartbeat(self, key: str, owner: str) -> Iterator[Callable[[], None]]:
        stop = threading.Event()
        lost = threading.Event()
        heartbeat_error: list[BaseException] = []
        interval = max(0.05, min(30.0, STALE_AFTER_SECONDS / 3))

        def maintain_lease() -> None:
            while not stop.wait(interval):
                try:
                    refreshed = self.refresh(key, owner)
                except ExportStoreError as exc:
                    heartbeat_error.append(exc)
                    lost.set()
                    return
                if not refreshed:
                    lost.set()
                    return

        thread = threading.Thread(target=maintain_lease, daemon=True)
        thread.start()

        def assert_healthy() -> None:
            if heartbeat_error:
                error = heartbeat_error[0]
                if isinstance(error, ExportStoreError):
                    raise error
                raise ExportStoreError("report export heartbeat failed") from error
            if lost.is_set():
                raise LeaseLostError("report export lease ownership was lost")

        try:
            yield assert_healthy
        finally:
            stop.set()
            thread.join(timeout=interval + 0.1)
            assert_healthy()

    def is_claimed(self, key: str) -> bool:
        with self._guard(key):
            path = self._lock_path(key)
            if not path.exists():
                return False
            self._lock_owner(path)
            return True

    def cleanup_orphans(self) -> None:
        if not self.root.exists():
            return
        cutoff = time.time() - STALE_AFTER_SECONDS
        for path in self.root.glob("*.tmp-*"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
            except OSError:
                continue
        for path in self.root.glob("*.lock"):
            key_token = path.name.removesuffix(".lock")
            with self._guard_token(key_token):
                if not path.exists():
                    continue
                owner = self._lock_owner(path)
                try:
                    # Refresh uses the same guard. Recheck owner and lease
                    # timestamp immediately before deletion.
                    if path.stat().st_mtime >= cutoff:
                        continue
                except OSError as exc:
                    raise ExportStoreError("report export state is unavailable") from exc
                self._unlink_if_owned(path, owner)

    @staticmethod
    def _lock_owner(path: Path) -> str:
        try:
            entries = list(path.iterdir())
        except FileNotFoundError:
            raise
        except (NotADirectoryError, OSError) as exc:
            raise ExportStoreError("report export lock is corrupt") from exc
        if len(entries) != 1 or not entries[0].is_file():
            raise ExportStoreError("report export lock is corrupt")
        return entries[0].name

    def _unlink_if_owned(self, path: Path, owner: str) -> bool:
        marker = path / owner
        try:
            marker.unlink()
        except FileNotFoundError:
            return False
        try:
            path.rmdir()
        except OSError:
            return False
        return True

    def _record_path(self, key: str) -> Path:
        return self.root / f"{self.token(key)}.json"

    def _lock_path(self, key: str) -> Path:
        return self.root / f"{self.token(key)}.lock"

    @contextmanager
    def _guard(self, key: str) -> Iterator[None]:
        with self._guard_token(self.token(key)):
            yield

    @contextmanager
    def _guard_token(self, token: str) -> Iterator[None]:
        guard_path = self.root / f"{token}.guard"
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            guard = guard_path.open("a+b")
        except OSError as exc:
            raise ExportStoreError("report export state is unavailable") from exc

        acquired = False
        deadline = time.monotonic() + _GUARD_TIMEOUT_SECONDS
        try:
            guard.seek(0, os.SEEK_END)
            if guard.tell() == 0:
                guard.write(b"\0")
                guard.flush()
            while not acquired:
                try:
                    guard.seek(0)
                    if os.name == "nt":
                        import msvcrt

                        msvcrt.locking(guard.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl

                        fcntl.flock(guard.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    acquired = True
                except OSError as exc:
                    if time.monotonic() >= deadline:
                        raise ExportStoreError("report export lock is busy") from exc
                    time.sleep(_GUARD_RETRY_SECONDS)
            yield
        finally:
            if acquired:
                try:
                    guard.seek(0)
                    if os.name == "nt":
                        import msvcrt

                        msvcrt.locking(guard.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        import fcntl

                        fcntl.flock(guard.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
            guard.close()
