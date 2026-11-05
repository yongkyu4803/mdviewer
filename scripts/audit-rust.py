"""Fail on vulnerabilities and unreviewed warnings; verify platform-scoped exceptions."""
import json
import subprocess
import sys

targets = ["aarch64-apple-darwin", "x86_64-pc-windows-msvc"]
inactive_advisories = {
    "RUSTSEC-2024-0370",  # proc-macro-error, Linux GTK build dependency
    "RUSTSEC-2024-0429",  # glib, Linux GTK runtime
    "RUSTSEC-2026-0370",  # zvariant, Linux portal
    "RUSTSEC-2026-0371",  # zbus_names, Linux portal
    "RUSTSEC-2026-0372",  # zvariant_derive, Linux portal
}
audit = subprocess.run(["cargo", "audit", "--json"], cwd="src-tauri", capture_output=True, text=True)
if audit.returncode not in (0, 1):
    sys.exit(audit.stderr or "cargo audit failed")
report = json.loads(audit.stdout)
trees = {}
for target in targets:
    output = subprocess.check_output(["cargo", "tree", "--manifest-path", "src-tauri/Cargo.toml", "--locked",
        "--target", target, "--prefix", "none", "--format", "{p}"], text=True)
    trees[target] = {tuple(line.split()[:2]) for line in output.splitlines()}
errors = []
for finding in report["vulnerabilities"]["list"]:
    errors.append(f"Vulnerability: {finding['advisory']['id']} {finding['package']['name']}")
for kind, findings in report.get("warnings", {}).items():
    for finding in findings:
        package = finding["package"]
        advisory = (finding.get("advisory") or {}).get("id", "unknown")
        active = [target for target, tree in trees.items() if (package["name"], "v" + package["version"]) in tree]
        description = f"{kind}: {advisory} {package['name']} {package['version']}"
        if advisory not in inactive_advisories or active:
            errors.append(description + f"; targets={active}")
        else:
            print(description + "; absent from both supported target trees (Linux-only exception)")
if errors:
    sys.exit("\n".join(errors))
print("Rust audit passed for macOS ARM64 and Windows x64; platform exceptions verified.")
