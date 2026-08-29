"""
Issue 01 — Domain package smoke tests.

These verify that the domain package is importable without any framework
dependency. They require no database, web framework, or external services.
"""

import importlib
import subprocess
import sys


def test_domain_package_importable() -> None:
    """The domain package must import cleanly with no framework dependencies."""
    domain = importlib.import_module("domain")
    assert domain is not None


def test_domain_entities_importable() -> None:
    """domain.entities must import cleanly."""
    entities = importlib.import_module("domain.entities")
    assert entities is not None


def test_domain_rules_importable() -> None:
    """domain.rules must import cleanly."""
    rules = importlib.import_module("domain.rules")
    assert rules is not None


def test_domain_has_no_framework_imports() -> None:
    """
    The domain package must not import fastapi, sqlalchemy, or uvicorn.
    This enforces the clean-architecture constraint documented in domain/__init__.py.
    Runs in an isolated process to avoid pollution from preceding test modules.
    """
    code = (
        "import sys, domain; "
        "forbidden = {'fastapi', 'sqlalchemy', 'uvicorn', 'alembic'}; "
        "violations = forbidden & set(sys.modules.keys()); "
        "assert not violations, f'Domain imported framework modules: {violations}'"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"Domain clean-architecture test failed:\n{result.stderr}"
