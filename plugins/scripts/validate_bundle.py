#!/usr/bin/env python3
"""
Plugin bundle validator for this repo

Goals:
- Enforce the hard requirements from the plugin parser fixtures:
  - .claude-plugin/plugin.json exists
  - plugin.json has at least name + version
  - commands/agents/skills markdown have YAML frontmatter with name/description
  - commands also have allowed-tools (list or comma string)
  - optional: hooks/hooks.json, .mcp.json
  - path safety: custom manifest paths must be relative and stay inside plugin root
- Provide a lightweight "team readiness" check:
  - command names are namespaced and unique across the bundle
- Run MCP selftests for plugin-local Node stdio servers (scope3-*).

No external Python deps.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REQUIRED_PLUGIN_MANIFEST_REL = Path(".claude-plugin") / "plugin.json"


@dataclass(frozen=True)
class Finding:
    level: str  # "ERROR" | "WARN"
    plugin: str
    message: str
    path: Optional[Path] = None

    def render(self) -> str:
        loc = f" ({self.path})" if self.path else ""
        return f"[{self.level}] {self.plugin}: {self.message}{loc}"


def is_safe_rel_path(p: str) -> bool:
    if not isinstance(p, str) or not p:
        return False
    # No absolute paths.
    if os.path.isabs(p):
        return False
    # Normalize and reject traversal.
    norm = os.path.normpath(p)
    if norm.startswith("..") or norm == "..":
        return False
    # Reject Windows drive letters / backslashes to keep rules simple.
    if re.match(r"^[A-Za-z]:\\\\", p):
        return False
    if "\\" in p:
        return False
    return True


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def list_plugin_dirs(bundle_root: Path) -> List[Path]:
    out: List[Path] = []
    for child in bundle_root.iterdir():
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        if (child / REQUIRED_PLUGIN_MANIFEST_REL).exists():
            out.append(child)
    return sorted(out, key=lambda p: p.name)


def extract_frontmatter(md: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (frontmatter, body) where both are strings, or (None, None) if missing.
    """
    if not md.startswith("---\n") and not md.startswith("---\r\n"):
        return (None, None)
    # Find the closing --- line.
    # Use a regex so it works across LF/CRLF.
    m = re.search(r"^---\s*$", md, flags=re.M)
    if not m:
        return (None, None)
    # First '---' is at pos 0; find the second.
    # Find all occurrences and take the second.
    matches = list(re.finditer(r"^---\s*$", md, flags=re.M))
    if len(matches) < 2:
        return (None, None)
    start = matches[0].end()
    end = matches[1].start()
    fm = md[start:end].strip("\r\n")
    body = md[matches[1].end() :].lstrip("\r\n")
    return (fm, body)


def parse_minimal_yaml(frontmatter: str) -> Dict[str, Any]:
    """
    Very small YAML subset parser sufficient for our frontmatter:
    - key: value (value is a string)
    - key: [a, b] is NOT supported (not used here)
    - key: newline + indented '- item' list
    """
    out: Dict[str, Any] = {}
    lines = frontmatter.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        i += 1
        if not line or line.lstrip().startswith("#"):
            continue
        if re.match(r"^\s", line):
            # Unexpected indent at top-level; ignore.
            continue
        m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$", line)
        if not m:
            continue
        key = m.group(1)
        rest = m.group(2)
        if rest == "":
            # Possibly a block list.
            items: List[str] = []
            while i < len(lines):
                nxt = lines[i].rstrip()
                if not nxt:
                    i += 1
                    continue
                if not re.match(r"^\s+", nxt):
                    break
                m2 = re.match(r"^\s*-\s*(.+?)\s*$", nxt)
                if m2:
                    items.append(m2.group(1))
                i += 1
            out[key] = items
        else:
            # Strip surrounding quotes (common in YAML frontmatter).
            v = rest.strip()
            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                v = v[1:-1]
            out[key] = v
    return out


def validate_md_frontmatter(
    plugin_name: str, md_path: Path, require_allowed_tools: bool
) -> List[Finding]:
    findings: List[Finding] = []
    try:
        md = md_path.read_text(encoding="utf-8")
    except Exception as e:
        return [Finding("ERROR", plugin_name, f"Failed to read markdown: {e}", md_path)]

    fm, _body = extract_frontmatter(md)
    if fm is None:
        return [Finding("ERROR", plugin_name, "Missing YAML frontmatter (--- ... ---)", md_path)]

    data = parse_minimal_yaml(fm)
    name = data.get("name")
    desc = data.get("description")
    if not isinstance(name, str) or not name.strip():
        findings.append(Finding("ERROR", plugin_name, "Frontmatter missing required `name`", md_path))
    if not isinstance(desc, str) or not desc.strip():
        findings.append(
            Finding("ERROR", plugin_name, "Frontmatter missing required `description`", md_path)
        )

    if require_allowed_tools:
        at = data.get("allowed-tools")
        if at is None:
            findings.append(
                Finding("ERROR", plugin_name, "Command frontmatter missing `allowed-tools`", md_path)
            )
        else:
            if isinstance(at, str):
                parts = [p.strip() for p in at.split(",") if p.strip()]
                if not parts:
                    findings.append(
                        Finding(
                            "ERROR",
                            plugin_name,
                            "`allowed-tools` must be a non-empty list or comma-separated string",
                            md_path,
                        )
                    )
            elif isinstance(at, list):
                if not at:
                    findings.append(
                        Finding(
                            "ERROR",
                            plugin_name,
                            "`allowed-tools` list must be non-empty",
                            md_path,
                        )
                    )
            else:
                findings.append(
                    Finding(
                        "ERROR",
                        plugin_name,
                        "`allowed-tools` must be a YAML list or comma-separated string",
                        md_path,
                    )
                )
    return findings


def gather_markdown_files(base: Path) -> List[Path]:
    if not base.exists():
        return []
    out: List[Path] = []
    for p in base.rglob("*.md"):
        if p.is_file():
            out.append(p)
    return sorted(out)


def validate_plugin_structure(plugin_dir: Path) -> Tuple[List[Finding], Dict[str, Any]]:
    """
    Returns (findings, info) where info includes collected command names.
    """
    plugin_name = plugin_dir.name
    findings: List[Finding] = []
    manifest_path = plugin_dir / REQUIRED_PLUGIN_MANIFEST_REL
    try:
        manifest = read_json(manifest_path)
    except Exception as e:
        return ([Finding("ERROR", plugin_name, f"Invalid plugin.json: {e}", manifest_path)], {})

    # Hard requirements.
    name = manifest.get("name")
    version = manifest.get("version")
    if not isinstance(name, str) or not name.strip():
        findings.append(Finding("ERROR", plugin_name, "plugin.json missing required string `name`", manifest_path))
    if not isinstance(version, str) or not version.strip():
        findings.append(
            Finding("ERROR", plugin_name, "plugin.json missing required string `version`", manifest_path)
        )

    # Path fields in the wild: commandsPath/agentsPath/skillsPath OR commands/agents/skills OR entrypoints.{...}
    paths: Dict[str, str] = {}

    def add_path(key: str, value: Any) -> None:
        if isinstance(value, str) and value:
            paths[key] = value

    add_path("commands", manifest.get("commands"))
    add_path("agents", manifest.get("agents"))
    add_path("skills", manifest.get("skills"))
    add_path("hooks", manifest.get("hooks"))
    add_path("mcp", manifest.get("mcp"))

    add_path("commandsPath", manifest.get("commandsPath"))
    add_path("agentsPath", manifest.get("agentsPath"))
    add_path("skillsPath", manifest.get("skillsPath"))

    entrypoints = manifest.get("entrypoints")
    if isinstance(entrypoints, dict):
        add_path("entrypoints.commands", entrypoints.get("commands"))
        add_path("entrypoints.agents", entrypoints.get("agents"))
        add_path("entrypoints.skills", entrypoints.get("skills"))

    # Default layout.
    commands_dir_rel = (
        paths.get("commands")
        or paths.get("commandsPath")
        or paths.get("entrypoints.commands")
        or "commands"
    )
    agents_dir_rel = (
        paths.get("agents") or paths.get("agentsPath") or paths.get("entrypoints.agents") or "agents"
    )
    skills_dir_rel = (
        paths.get("skills") or paths.get("skillsPath") or paths.get("entrypoints.skills") or "skills"
    )

    for label, rel in [
        ("commands", commands_dir_rel),
        ("agents", agents_dir_rel),
        ("skills", skills_dir_rel),
    ]:
        if not is_safe_rel_path(rel):
            findings.append(
                Finding(
                    "ERROR",
                    plugin_name,
                    f"Unsafe {label} path in plugin.json: {rel!r}",
                    manifest_path,
                )
            )

    commands_dir = plugin_dir / commands_dir_rel
    agents_dir = plugin_dir / agents_dir_rel
    skills_dir = plugin_dir / skills_dir_rel

    if not commands_dir.exists():
        findings.append(Finding("ERROR", plugin_name, f"Missing commands dir: {commands_dir_rel}", commands_dir))
    if not agents_dir.exists():
        findings.append(Finding("ERROR", plugin_name, f"Missing agents dir: {agents_dir_rel}", agents_dir))
    if not skills_dir.exists():
        findings.append(Finding("ERROR", plugin_name, f"Missing skills dir: {skills_dir_rel}", skills_dir))

    # Optional paths.
    if "hooks" in paths:
        rel = paths["hooks"]
        if not is_safe_rel_path(rel):
            findings.append(Finding("ERROR", plugin_name, f"Unsafe hooks path: {rel!r}", manifest_path))
        else:
            hp = plugin_dir / rel
            if not hp.exists():
                findings.append(Finding("ERROR", plugin_name, f"hooks file missing: {rel}", hp))

    if "mcp" in paths:
        rel = paths["mcp"]
        if not is_safe_rel_path(rel):
            findings.append(Finding("ERROR", plugin_name, f"Unsafe mcp path: {rel!r}", manifest_path))
        else:
            mp = plugin_dir / rel
            if not mp.exists():
                findings.append(Finding("ERROR", plugin_name, f"mcp file missing: {rel}", mp))

    # Recommend a README for production readiness.
    if not (plugin_dir / "README.md").exists():
        findings.append(Finding("WARN", plugin_name, "Missing README.md", plugin_dir))

    # Validate markdown frontmatter.
    command_names: List[str] = []

    for p in gather_markdown_files(commands_dir):
        findings.extend(validate_md_frontmatter(plugin_name, p, require_allowed_tools=True))
        # Extract command name for team readiness.
        try:
            md = p.read_text(encoding="utf-8")
            fm, _ = extract_frontmatter(md)
            if fm:
                data = parse_minimal_yaml(fm)
                n = data.get("name")
                if isinstance(n, str) and n.strip():
                    command_names.append(n.strip())
        except Exception:
            pass

    for p in gather_markdown_files(agents_dir):
        findings.extend(validate_md_frontmatter(plugin_name, p, require_allowed_tools=False))

    if skills_dir.exists():
        for child in sorted([c for c in skills_dir.iterdir() if c.is_dir() and not c.name.startswith(".")]):
            skill_md = child / "SKILL.md"
            if not skill_md.exists():
                findings.append(Finding("ERROR", plugin_name, f"Missing SKILL.md in skills/{child.name}", child))
                continue
            findings.extend(validate_md_frontmatter(plugin_name, skill_md, require_allowed_tools=False))

    # Validate .mcp.json if present (portability + json parse).
    mcp_json = plugin_dir / ".mcp.json"
    if mcp_json.exists():
        try:
            mcp_obj = read_json(mcp_json)
            if not isinstance(mcp_obj.get("mcpServers"), dict):
                findings.append(Finding("ERROR", plugin_name, ".mcp.json missing mcpServers object", mcp_json))
        except Exception as e:
            findings.append(Finding("ERROR", plugin_name, f"Invalid .mcp.json: {e}", mcp_json))
        else:
            # Portability heuristic: reject hard-coded /Users paths.
            raw = mcp_json.read_text(encoding="utf-8")
            if "/Users/" in raw:
                findings.append(Finding("ERROR", plugin_name, ".mcp.json contains hard-coded /Users path", mcp_json))

    return (findings, {"command_names": command_names})


def _frame(msg: Dict[str, Any]) -> bytes:
    body = json.dumps(msg).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8")
    return header + body


def _read_frame(stream) -> Dict[str, Any]:
    # Read headers until blank line.
    header = b""
    while b"\r\n\r\n" not in header:
        chunk = stream.read(1)
        if not chunk:
            raise RuntimeError("EOF while reading MCP headers")
        header += chunk
        if len(header) > 64 * 1024:
            raise RuntimeError("MCP header too large")

    head, rest = header.split(b"\r\n\r\n", 1)
    m = re.search(br"content-length\s*:\s*(\d+)", head, flags=re.I)
    if not m:
        raise RuntimeError("Missing Content-Length header in MCP frame")
    length = int(m.group(1))
    body = rest
    while len(body) < length:
        chunk = stream.read(length - len(body))
        if not chunk:
            raise RuntimeError("EOF while reading MCP body")
        body += chunk
    payload = body[:length]
    return json.loads(payload.decode("utf-8"))


def mcp_selftest_stdio(cmd: List[str]) -> Tuple[bool, str]:
    """
    Returns (ok, message).
    """
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
        )
    except FileNotFoundError as e:
        return (False, f"Command not found: {e}")
    except Exception as e:
        return (False, f"Failed to start MCP server: {e}")

    assert proc.stdin and proc.stdout
    try:
        proc.stdin.write(_frame({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}}))
        proc.stdin.flush()
        init_resp = _read_frame(proc.stdout)
        if init_resp.get("id") != 1 or "result" not in init_resp:
            return (False, f"Unexpected initialize response: {init_resp}")

        proc.stdin.write(_frame({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}))
        proc.stdin.flush()
        list_resp = _read_frame(proc.stdout)
        tools = list_resp.get("result", {}).get("tools", [])
        if not isinstance(tools, list) or not tools:
            return (False, f"tools/list returned no tools: {list_resp}")

        tool_names = [t.get("name") for t in tools if isinstance(t, dict)]
        health = next((n for n in tool_names if isinstance(n, str) and n.endswith(".health")), None)
        sha = next((n for n in tool_names if isinstance(n, str) and n.endswith(".sha256")), None)
        if not health or not sha:
            return (False, f"Expected *.health and *.sha256 tools, got: {tool_names}")

        proc.stdin.write(_frame({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": health, "arguments": {}}}))
        proc.stdin.flush()
        health_resp = _read_frame(proc.stdout)
        if health_resp.get("id") != 3 or "result" not in health_resp:
            return (False, f"Unexpected health response: {health_resp}")

        text = "mcp-selftest"
        proc.stdin.write(_frame({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": sha, "arguments": {"text": text}}}))
        proc.stdin.flush()
        sha_resp = _read_frame(proc.stdout)
        result = sha_resp.get("result", {})
        content = result.get("content", [])
        if not isinstance(content, list) or not content:
            return (False, f"Unexpected sha256 response content: {sha_resp}")
        out_text = content[0].get("text") if isinstance(content[0], dict) else None
        if not isinstance(out_text, str) or not re.fullmatch(r"[0-9a-f]{64}", out_text):
            return (False, f"Unexpected sha256 digest: {out_text!r}")

        return (True, "OK")
    finally:
        try:
            proc.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def validate_mcp_servers(bundle_root: Path, plugin_dir: Path) -> List[Finding]:
    """
    Only selftests local Node stdio MCP servers (transport stdio, command node, args in-plugin).
    """
    plugin_name = plugin_dir.name
    mcp_json = plugin_dir / ".mcp.json"
    if not mcp_json.exists():
        return []
    try:
        mcp_obj = read_json(mcp_json)
    except Exception:
        return []
    servers = mcp_obj.get("mcpServers")
    if not isinstance(servers, dict):
        return []

    findings: List[Finding] = []
    for server_name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        transport = cfg.get("transport")
        command = cfg.get("command")
        args = cfg.get("args")
        if transport != "stdio":
            continue
        if command != "node":
            continue
        if not isinstance(args, list) or not args:
            continue
        rel0 = args[0]
        if not isinstance(rel0, str) or not is_safe_rel_path(rel0):
            findings.append(Finding("ERROR", plugin_name, f"Unsafe MCP args[0] for {server_name}: {rel0!r}", mcp_json))
            continue
        script_path = (plugin_dir / rel0).resolve()
        try:
            script_path.relative_to(plugin_dir.resolve())
        except Exception:
            findings.append(Finding("ERROR", plugin_name, f"MCP script escapes plugin root: {rel0}", mcp_json))
            continue
        ok, msg = mcp_selftest_stdio(["node", str(script_path)])
        if not ok:
            findings.append(Finding("ERROR", plugin_name, f"MCP selftest failed for {server_name}: {msg}", script_path))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate plugin bundle contract + demo readiness checks.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """\
            Examples:
              ./scripts/validate_bundle.py
              ./scripts/validate_bundle.py --mcp-selftest
            """
        ),
    )
    parser.add_argument(
        "--bundle-root",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to plugin bundle root (default: repo root).",
    )
    parser.add_argument(
        "--mcp-selftest",
        action="store_true",
        help="Run selftests for plugin-local Node stdio MCP servers (scope3-*).",
    )
    args = parser.parse_args()

    bundle_root = Path(args.bundle_root).resolve()
    plugins = list_plugin_dirs(bundle_root)
    if not plugins:
        print(f"No plugins found under {bundle_root} (expected */{REQUIRED_PLUGIN_MANIFEST_REL})", file=sys.stderr)
        return 2

    findings: List[Finding] = []
    all_command_names: List[Tuple[str, str]] = []  # (plugin, name)

    for plugin_dir in plugins:
        f, info = validate_plugin_structure(plugin_dir)
        findings.extend(f)
        for n in info.get("command_names", []):
            all_command_names.append((plugin_dir.name, n))

    # Optional: validate team maps (composition readiness).
    team_map_path = bundle_root / "teams" / "teams.json"
    if team_map_path.exists():
        try:
            team_map = read_json(team_map_path)
        except Exception as e:
            findings.append(Finding("ERROR", "teams", f"Invalid teams.json: {e}", team_map_path))
        else:
            teams = team_map.get("teams")
            if not isinstance(teams, dict) or not teams:
                findings.append(
                    Finding("ERROR", "teams", "teams.json must contain a non-empty `teams` object", team_map_path)
                )
            else:
                plugin_names = {p.name for p in plugins}
                for team_name, cfg in teams.items():
                    if not isinstance(cfg, dict):
                        findings.append(
                            Finding("ERROR", "teams", f"Team {team_name!r} must be an object", team_map_path)
                        )
                        continue
                    pls = cfg.get("plugins")
                    if not isinstance(pls, list) or not all(isinstance(x, str) for x in pls):
                        findings.append(
                            Finding(
                                "ERROR",
                                "teams",
                                f"Team {team_name!r} must have `plugins: [..]` (list of strings)",
                                team_map_path,
                            )
                        )
                        continue
                    missing = sorted([p for p in pls if p not in plugin_names])
                    if missing:
                        findings.append(
                            Finding(
                                "ERROR",
                                "teams",
                                f"Team {team_name!r} references missing plugins: {missing}",
                                team_map_path,
                            )
                        )

    # Team readiness: ensure command names are unique across plugins.
    name_to_plugins: Dict[str, List[str]] = {}
    for plugin, name in all_command_names:
        name_to_plugins.setdefault(name, []).append(plugin)
    for name, pls in sorted(name_to_plugins.items()):
        if len(pls) > 1:
            findings.append(
                Finding(
                    "ERROR",
                    "bundle",
                    f"Duplicate command name {name!r} across plugins: {sorted(pls)}",
                    bundle_root,
                )
            )

    if args.mcp_selftest:
        for plugin_dir in plugins:
            findings.extend(validate_mcp_servers(bundle_root, plugin_dir))

    # Render findings.
    errors = [f for f in findings if f.level == "ERROR"]
    warns = [f for f in findings if f.level == "WARN"]

    for f in errors + warns:
        print(f.render())

    print()
    print(f"Plugins: {len(plugins)} | Errors: {len(errors)} | Warnings: {len(warns)}")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
