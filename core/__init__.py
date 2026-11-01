"""Core engine modules for Project Angel.

The package keeps planning, workspace management, execution, memory,
container, and watchdog functionality behind a stable import boundary.
"""

from .path_policy import validate_workspace_relative_path

__all__ = ["validate_workspace_relative_path"]