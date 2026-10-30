"""Phase 1 planning primitives for Jarvis-Core.

The module is provider-agnostic. A real LLM adapter can be passed to
``build_plan``; the built-in planner is deterministic and dependency-free.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import PurePosixPath
from typing import Any, Callable, Mapping


@dataclass(frozen=True)
class FileSpec:
    path: str
    content: str = ""


@dataclass(frozen=True)
class ProjectPlan:
    project_name: str
    description: str
    runtime: str = "python"
    entrypoint: str = "main.py"
    directories: list[str] = field(default_factory=list)
    files: list[FileSpec] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    commands: list[list[str]] = field(default_factory=list)
    database: dict[str, Any] = field(default_factory=dict)
    api_endpoints: list[dict[str, str]] = field(default_factory=list)
    dependency_graph: dict[str, list[str]] = field(default_factory=dict)
    migrations: list[dict[str, str]] = field(default_factory=list)
    seed_scripts: list[str] = field(default_factory=list)
    pipeline: list[dict[str, Any]] = field(default_factory=list)

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
    """Extract deterministic requirements without external NLP dependencies."""
    if not isinstance(user_input, str) or not user_input.strip():
        raise ValueError("user_input must be a non-empty string")
    text = user_input.strip()
    lowered = text.lower()
    return {
        "description": text,
        "project_name": _slugify(text.split()[0]),
        "features": {
            "database": _contains_any(lowered, ("database", "sqlite", "postgres", "orm")),
            "api": _contains_any(lowered, ("api", "backend", "rest", "fastapi", "flask")),
            "ui": _contains_any(lowered, ("ui", "frontend", "web app", "dashboard")),
            "authentication": _contains_any(lowered, ("auth", "login", "authentication")),
        },
    }


def generate_plan(requirements: Mapping[str, Any]) -> dict[str, Any]:
    """Generate a JSON-serializable project plan from parsed requirements."""
    description = str(requirements["description"])
    features = dict(requirements.get("features", {}))
    files = [
        {"path": "main.py", "content": 'def main():\n    print("Generated application is ready")\n\n\nif __name__ == "__main__":\n    main()\n'},
        {"path": "README.md", "content": f"# {requirements.get('project_name', 'generated-app')}\n\n{description}\n"},
        {"path": "src/__init__.py", "content": ""},
        {"path": "src/models.py", "content": "class Item:\n    def __init__(self, name: str):\n        self.name = name\n"},
        {"path": "src/services.py", "content": "from .models import Item\n\ndef create_item(name: str) -> Item:\n    return Item(name)\n"},
        {"path": "src/api.py", "content": "from .services import create_item\n\ndef health() -> dict[str, str]:\n    return {'status': 'ok'}\n"},
        {"path": "tests/__init__.py", "content": ""},
    ]
    directories = ["src", "tests"]
    dependencies: list[str] = ["pytest"]
    database: dict[str, Any] = {}
    endpoints: list[dict[str, str]] = []
    dependency_graph: dict[str, list[str]] = {
        "src": [],
        "src/models.py": ["database"],
        "src/services.py": ["src/models.py"],
        "src/api.py": ["src/services.py"],
        "migrations/001_initial.py": ["src/models.py"],
        "scripts/seed.py": ["migrations/001_initial.py"],
        "tests/test_contract.py": ["src/api.py", "scripts/seed.py"],
    }
    migrations: list[dict[str, str]] = []
    seed_scripts: list[str] = []

    if features.get("database"):
        directories.append("data")
        directories.extend(["migrations", "scripts"])
        database = {
            "engine": "sqlite",
            "path": "data/app.db",
            "tables": [{"name": "items", "columns": ["id", "name"]}],
        }
        migrations = [{
            "id": "001_initial",
            "path": "migrations/001_initial.py",
            "description": "Create the items table",
        }]
        seed_scripts = ["scripts/seed.py"]
    if features.get("api"):
        endpoints = [{"method": "GET", "path": "/health", "description": "Health check"}]
    if features.get("ui"):
        directories.append("templates")
    if features.get("authentication"):
        database.setdefault("tables", []).append({"name": "users", "columns": ["id", "username"]})

    if features.get("database"):
        files.extend([
            {"path": "migrations/__init__.py", "content": ""},
            {"path": "migrations/001_initial.py", "content": (
                "from pathlib import Path\n"
                "import sqlite3\n\n"
                "def migrate(db_path):\n"
                "    Path(db_path).parent.mkdir(parents=True, exist_ok=True)\n"
                "    with sqlite3.connect(db_path) as connection:\n"
                "        connection.execute('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')\n"
                "        connection.commit()\n"
                "\n"
                "if __name__ == '__main__':\n"
                "    migrate('data/app.db')\n"
            )},
            {"path": "scripts/seed.py", "content": (
                "import sqlite3\n\n"
                "def seed(db_path):\n"
                "    with sqlite3.connect(db_path) as connection:\n"
                "        connection.execute(\"INSERT INTO items(name) VALUES (?)\", (\"fixture-item\",))\n"
                "        connection.commit()\n"
                "\n"
                "if __name__ == '__main__':\n"
                "    seed('data/app.db')\n"
            )},
            {"path": "tests/test_contract.py", "content": (
                "import sqlite3\n"
                "from pathlib import Path\n\n"
                "def test_seed_fixture_exists():\n"
                "    db = Path('data/app.db')\n"
                "    assert db.exists()\n"
                "    with sqlite3.connect(db) as connection:\n"
                "        assert connection.execute('SELECT COUNT(*) FROM items').fetchone()[0] >= 1\n"
            )},
        ])

    pipeline = [
        {"name": "migrate", "command": ["python", "migrations/001_initial.py"], "required": bool(features.get("database"))},
        {"name": "seed", "command": ["python", "-c", "from scripts.seed import seed; seed('data/app.db')"], "required": bool(features.get("database"))},
        {"name": "tests", "command": ["python", "-m", "pytest", "-q"], "required": True},
    ]

    return {
        "project_name": str(requirements.get("project_name", "generated-app")),
        "description": description,
        "runtime": "python",
        "entrypoint": "main.py",
        "directories": sorted(set(directories)),
        "files": files,
        "dependencies": dependencies,
        "commands": [["python", "main.py"]],
        "database": database,
        "api_endpoints": endpoints,
        "dependency_graph": dependency_graph,
        "migrations": migrations,
        "seed_scripts": seed_scripts,
        "pipeline": pipeline,
    }


def validate_plan(plan: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and normalize an LLM-produced or local plan."""
    required = ("project_name", "files", "directories", "commands")
    missing = [key for key in required if key not in plan]
    if missing:
        raise ValueError(f"plan is missing required fields: {', '.join(missing)}")
    normalized = dict(plan)
    normalized["directories"] = [str(PurePosixPath(path)) for path in plan["directories"]]
    normalized["files"] = [
        {"path": str(PurePosixPath(item["path"])), "content": str(item.get("content", ""))}
        for item in plan["files"]
    ]
    normalized["commands"] = [list(map(str, command)) for command in plan["commands"]]
    normalized.setdefault("dependency_graph", {})
    normalized.setdefault("migrations", [])
    normalized.setdefault("seed_scripts", [])
    normalized.setdefault("pipeline", [])
    return normalized


def build_plan(
    user_input: str,
    planner: Callable[[str], Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a validated plan, optionally using an external LLM adapter."""
    if planner is not None:
        return validate_plan(planner(user_input))
    return validate_plan(generate_plan(parse_user_input(user_input)))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate a Jarvis-Core project plan")
    parser.add_argument("idea", help="Natural-language application idea")
    args = parser.parse_args()
    print(json.dumps(build_plan(args.idea), indent=2))