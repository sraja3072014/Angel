"""Immutable zero-trust policy for paths inside a Project Angel workspace."""

from __future__ import annotations

import os
import stat
from pathlib import Path, PurePosixPath


class WorkspacePathError(ValueError):
    """Raised when a path is not a safe workspace-relative path."""


_RESERVED_DEVICE_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


def _reject_component(component: str, original: str) -> None:
    if component in {"", ".", ".."}:
        raise WorkspacePathError(f"unsafe workspace path: {original!r}")
    if component.rstrip(" .") != component:
        raise WorkspacePathError(f"path component has trailing dot or whitespace: {original!r}")
    if component.upper().split(".", 1)[0] in _RESERVED_DEVICE_NAMES:
        raise WorkspacePathError(f"reserved Windows device name: {original!r}")


def _reject_reparse_or_symlink(path: Path, base_dir: Path, original: str) -> None:
    """Reject existing symlink/reparse components and escapes from base_dir."""
    current = base_dir
    try:
        relative_parts = path.relative_to(base_dir).parts
    except ValueError as error:
        raise WorkspacePathError(f"path escapes workspace: {original!r}") from error

    for component in relative_parts:
        current = current / component
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        except OSError as error:
            raise WorkspacePathError(f"cannot inspect workspace path: {original!r}") from error
        if stat.S_ISLNK(info.st_mode):
            raise WorkspacePathError(f"symlink is not allowed in workspace path: {original!r}")
        # Windows reparse points include junctions and other redirectors.
        if os.name == "nt" and getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
            raise WorkspacePathError(f"reparse point is not allowed in workspace path: {original!r}")


def validate_workspace_relative_path(path_str: str, base_dir: Path) -> Path:
    """Validate and canonicalize a path relative to ``base_dir``.

    The policy is intentionally immutable: callers receive a canonical path,
    but this function never creates, deletes, or modifies filesystem entries.
    Existing symlinks and Windows reparse points are rejected rather than
    followed. New parent directories must be created only after validation.
    """
    if not isinstance(path_str, str) or not path_str:
        raise WorkspacePathError("workspace path must be a non-empty string")
    if "\x00" in path_str or any(ord(char) < 32 or ord(char) == 127 for char in path_str):
        raise WorkspacePathError("workspace path contains a control character")
    if path_str.endswith((".", " ", "\t", "\r", "\n")):
        raise WorkspacePathError("workspace path has a trailing dot or whitespace")
    if ":" in path_str:
        raise WorkspacePathError("drive paths and alternate data streams are not allowed")
    if path_str.startswith(("/", "\\")) or path_str.startswith(("//", "\\\\")):
        raise WorkspacePathError("absolute and UNC paths are not allowed")
    if len(path_str) >= 2 and path_str[1] == ":":
        raise WorkspacePathError("Windows drive paths are not allowed")

    normalized_text = path_str.replace("\\", "/")
    raw_parts = normalized_text.split("/")
    if any(part in {"", ".", ".."} for part in raw_parts):
        raise WorkspacePathError(f"unsafe workspace path: {path_str!r}")
    pure = PurePosixPath(normalized_text)
    if pure.is_absolute() or not pure.parts:
        raise WorkspacePathError(f"unsafe workspace path: {path_str!r}")
    for component in pure.parts:
        _reject_component(component, path_str)

    base = Path(base_dir).resolve(strict=True)
    candidate = base.joinpath(*pure.parts)
    try:
        resolved = candidate.resolve(strict=False)
        resolved.relative_to(base)
    except (OSError, ValueError) as error:
        raise WorkspacePathError(f"path escapes workspace: {path_str!r}") from error
    _reject_reparse_or_symlink(candidate, base, path_str)
    return resolved