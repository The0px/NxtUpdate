# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**.

Please report it privately by emailing the maintainer or using [GitHub's private vulnerability reporting](https://github.com/scorpion7slayer/NxtUpdate/security/advisories/new).

Include:
- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You will receive a response within **72 hours**. If the vulnerability is confirmed, a patch will be released as soon as possible and you will be credited in the release notes.

## Scope

NxtUpdate runs commands on your local machine (e.g. `brew upgrade`, `pip install`, `softwareupdate`, and AI agent updaters such as `claude update`). Commands are spawned without a shell, package names are validated before use, and remote version data is checked against a strict format. Please report any issue that could allow:

- Arbitrary command execution beyond the intended scope
- Running an AI agent updater against a binary that is not that agent, or running a downloaded installer script
- Terminal escape sequences from package or registry data reaching the screen
- Privilege escalation through the `sudo softwareupdate` step, or `--no-sudo` failing to skip it
- Supply chain issues in the published npm package

## Out of Scope

- Vulnerabilities in third-party package managers (Homebrew, pip, cargo…) or in AI agent updaters — report those upstream
- Issues requiring physical access to the machine
