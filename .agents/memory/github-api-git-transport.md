---
name: GitHub API versus Git transport
description: GitHub API access and Git transport authentication can diverge in this Replit environment.
---

Treat GitHub connector API access and terminal Git push authentication as separate capabilities. A healthy connected account may answer GitHub API requests while an HTTPS Git push fails authentication, and SSH/gh may not be configured either. Do not infer a successful push or branch protection from connector health.

**Why:** In this workspace, the connected account could read its repository through the connector proxy, but the shell's Git credential path was rejected by GitHub. Uploading a working-tree snapshot through the API would silently discard the repository's existing local history.

**How to apply:** Check the branch on GitHub after a push, and only report reviewed-PR enforcement after reading back the actual protection rules. If Git transport is unavailable, keep the intended remote configured and ask for a supported Git-pane push or credential repair rather than reconstructing history through the contents API.