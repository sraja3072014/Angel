"""Strict, provider-agnostic planning primitives for Project Angel."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Mapping

from .path_policy import WorkspacePathError, validate_workspace_relative_path

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _canonical_relative_path(value: object, *, field_name: str = "path") -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    try:
        validate_workspace_relative_path(value, Path.cwd().resolve())
    except WorkspacePathError as error:
        raise ValueError(f"invalid {field_name}: {value!r}") from error
    return PurePosixPath(value.replace("\\", "/")).as_posix()


@dataclass(frozen=True)
class FileSpec:
    relative_path: str
    content: str = ""
    executable: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "relative_path", _canonical_relative_path(self.relative_path, field_name="relative_path"))
        if not isinstance(self.content, str):
            raise TypeError("content must be a string")
        if not isinstance(self.executable, bool):
            raise TypeError("executable must be a boolean")

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "FileSpec":
        if not isinstance(value, Mapping):
            raise TypeError("each file must be an object")
        return cls(value.get("relative_path", value.get("path")), value.get("content", ""), value.get("executable", False))


@dataclass(frozen=True)
class PipelineStage:
    name: str
    command: list[str]
    timeout_seconds: int

    def __post_init__(self) -> None:
        if not isinstance(self.name, str) or not self.name.strip():
            raise ValueError("pipeline stage name must be a non-empty string")
        if not isinstance(self.command, list) or not self.command or any(not isinstance(item, str) or not item for item in self.command):
            raise ValueError("pipeline stage command must be a non-empty list of strings")
        if isinstance(self.timeout_seconds, bool) or not isinstance(self.timeout_seconds, int) or self.timeout_seconds <= 0:
            raise ValueError("pipeline stage timeout_seconds must be an integer greater than zero")

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "PipelineStage":
        return cls(str(value.get("name", "")), list(value.get("command", [])), int(value.get("timeout_seconds", 60)))


@dataclass(frozen=True)
class ProjectPlan:
    project_name: str
    files: list[FileSpec]
    pipeline: list[PipelineStage]
    dependency_graph: dict[str, list[str]]
    description: str = ""
    runtime: str = "python"
    entrypoint: str = "main.py"
    directories: list[str] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    commands: list[list[str]] = field(default_factory=list)
    database: dict[str, Any] = field(default_factory=dict)
    api_endpoints: list[dict[str, str]] = field(default_factory=list)
    migrations: list[dict[str, str]] = field(default_factory=list)
    seed_scripts: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.project_name, str) or not _SLUG_PATTERN.fullmatch(self.project_name):
            raise ValueError("project_name must be a lowercase alphanumeric slug")
        file_paths = {item.relative_path for item in self.files}
        if len(file_paths) != len(self.files):
            raise ValueError("files must not contain duplicate relative_path values")
        canonical_graph: dict[str, list[str]] = {}
        for source, dependencies in self.dependency_graph.items():
            source_path = _canonical_relative_path(source, field_name="dependency_graph key")
            if source_path not in file_paths:
                raise ValueError(f"dependency_graph key is not a declared file: {source!r}")
            if not isinstance(dependencies, list):
                raise TypeError("dependency_graph values must be lists")
            values = [_canonical_relative_path(item, field_name="dependency_graph dependency") for item in dependencies]
            if any(item not in file_paths for item in values):
                raise ValueError("dependency_graph may contain only declared file paths")
            canonical_graph[source_path] = list(dict.fromkeys(values))
        object.__setattr__(self, "dependency_graph", canonical_graph)
        object.__setattr__(self, "directories", [_canonical_relative_path(item, field_name="directory") for item in self.directories])

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "generated-app"


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def parse_user_input(user_input: str) -> dict[str, Any]:
    if not isinstance(user_input, str) or not user_input.strip():
        raise ValueError("user_input must be a non-empty string")
    text = user_input.strip()
    lowered = text.lower()
    return {"description": text, "project_name": _slugify(text.split()[0]), "features": {
        "database": _contains_any(lowered, ("database", "sqlite", "postgres", "orm")),
        "api": _contains_any(lowered, ("api", "backend", "rest", "fastapi", "flask")),
        "ui": _contains_any(lowered, ("ui", "frontend", "web app", "dashboard")),
        "authentication": _contains_any(lowered, ("auth", "login", "authentication")),
    }}


def generate_plan(requirements: Mapping[str, Any]) -> dict[str, Any]:
    description = str(requirements["description"])
    features = dict(requirements.get("features", {}))
    files = [
        {"relative_path": "main.py", "content": 'def main():\n    print("Generated application is ready")\n\n\nif __name__ == "__main__":\n    main()\n'},
        {"relative_path": "README.md", "content": f"# {requirements.get('project_name', 'generated-app')}\n\n{description}\n"},
        {"relative_path": "src/__init__.py", "content": ""},
        {"relative_path": "src/models.py", "content": "class Item:\n    def __init__(self, name: str):\n        self.name = name\n"},
        {"relative_path": "src/services.py", "content": "from .models import Item\n\ndef create_item(name: str) -> Item:\n    return Item(name)\n"},
        {"relative_path": "src/api.py", "content": "from .services import create_item\n\ndef health() -> dict[str, str]:\n    return {'status': 'ok'}\n"},
        {"relative_path": "tests/__init__.py", "content": ""},
    ]
    directories = ["src", "tests"]
    database: dict[str, Any] = {}
    graph: dict[str, list[str]] = {"main.py": [], "README.md": [], "src/__init__.py": [], "src/models.py": [], "src/services.py": ["src/models.py"], "src/api.py": ["src/services.py"], "tests/__init__.py": []}
    migrations: list[dict[str, str]] = []
    seed_scripts: list[str] = []
    if features.get("database"):
        directories += ["data", "migrations", "scripts"]
        database = {"engine": "sqlite", "path": "data/app.db", "tables": [{"name": "items", "columns": ["id", "name"]}]}
        migrations = [{"id": "001_initial", "path": "migrations/001_initial.py", "description": "Create the items table"}]
        seed_scripts = ["scripts/seed.py"]
        files += [
            {"relative_path": "migrations/__init__.py", "content": ""},
            {"relative_path": "migrations/001_initial.py", "content": "from pathlib import Path\nimport sqlite3\n\ndef migrate(db_path):\n    Path(db_path).parent.mkdir(parents=True, exist_ok=True)\n    with sqlite3.connect(db_path) as connection:\n        connection.execute('CREATE TABLE IF NOT EXISTS schema_migrations (migration_id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')\n        connection.execute('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)')\n        connection.execute('INSERT INTO schema_migrations(migration_id) VALUES (?) ON CONFLICT(migration_id) DO NOTHING', ('001_initial',))\n        connection.commit()\n\nif __name__ == '__main__':\n    migrate('data/app.db')\n"},
            {"relative_path": "scripts/seed.py", "content": "import sqlite3\n\ndef seed(db_path):\n    with sqlite3.connect(db_path) as connection:\n        connection.execute('INSERT INTO items(id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING', (1, 'fixture-item'))\n        connection.commit()\n\nif __name__ == '__main__':\n    seed('data/app.db')\n"},
            {"relative_path": "tests/test_contract.py", "content": "import sqlite3\nfrom pathlib import Path\n\ndef test_seed_fixture_exists():\n    db = Path('data/app.db')\n    assert db.exists()\n    with sqlite3.connect(db) as connection:\n        assert connection.execute('SELECT COUNT(*) FROM items').fetchone()[0] >= 1\n"},
        ]
        graph.update({"migrations/__init__.py": [], "migrations/001_initial.py": ["src/models.py"], "scripts/seed.py": ["migrations/001_initial.py"], "tests/test_contract.py": ["src/api.py", "scripts/seed.py"]})
    if features.get("api"):
        endpoints = [{"method": "GET", "path": "/health", "description": "Health check"}]
    else:
        endpoints = []
    if features.get("ui"):
        directories.append("templates")
    if features.get("authentication"):
        database.setdefault("tables", []).append({"name": "users", "columns": ["id", "username"]})
    pipeline = [{"name": "migrate", "command": ["python", "migrations/001_initial.py"], "timeout_seconds": 60}, {"name": "seed", "command": ["python", "-c", "from scripts.seed import seed; seed('data/app.db')"], "timeout_seconds": 60}, {"name": "tests", "command": ["python", "-m", "pytest", "-q"], "timeout_seconds": 120}]
    return {"project_name": str(requirements.get("project_name", "generated-app")), "description": description, "runtime": "python", "entrypoint": "main.py", "directories": sorted(set(directories)), "files": files, "dependencies": ["pytest"], "commands": [["python", "main.py"]], "database": database, "api_endpoints": endpoints, "dependency_graph": graph, "migrations": migrations, "seed_scripts": seed_scripts, "pipeline": pipeline}


def validate_plan(plan: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(plan, Mapping):
        raise TypeError("plan must be an object")
    required = ("project_name", "files", "pipeline", "dependency_graph")
    missing = [key for key in required if key not in plan]
    if missing:
        raise ValueError(f"plan is missing required fields: {', '.join(missing)}")
    model = ProjectPlan(
        project_name=str(plan["project_name"]), files=[FileSpec.from_mapping(item) for item in plan["files"]], pipeline=[PipelineStage.from_mapping(item) for item in plan["pipeline"]], dependency_graph={str(key): list(value) for key, value in dict(plan["dependency_graph"]).items()}, description=str(plan.get("description", "")), runtime=str(plan.get("runtime", "python")), entrypoint=_canonical_relative_path(plan.get("entrypoint", "main.py"), field_name="entrypoint"), directories=list(plan.get("directories", [])), dependencies=[str(item) for item in plan.get("dependencies", [])], commands=[list(map(str, command)) for command in plan.get("commands", [])], database=dict(plan.get("database", {})), api_endpoints=list(plan.get("api_endpoints", [])), migrations=list(plan.get("migrations", [])), seed_scripts=[_canonical_relative_path(item, field_name="seed script") for item in plan.get("seed_scripts", [])]
    )
    return model.to_dict()


def build_plan(user_input: str, planner: Callable[[str], Mapping[str, Any]] | None = None) -> dict[str, Any]:
    return validate_plan(planner(user_input) if planner is not None else generate_plan(parse_user_input(user_input)))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate a Project Angel project plan")
    parser.add_argument("idea")
    args = parser.parse_args()
    print(json.dumps(build_plan(args.idea), indent=2))