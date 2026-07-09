# agent-canvas Helm chart

Helm chart for running the [OpenHands agent-canvas](https://github.com/OpenHands/agent-canvas)
all-in-one image (frontend + agent-server + automation) on Kubernetes as a
`StatefulSet` with persistent storage, an `Ingress`, and optional in-cluster
RBAC.

## TL;DR

```bash
helm install agent-canvas ./helm/agent-canvas
```

## What gets deployed

| Resource                            | Purpose                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `StatefulSet`                       | Single-replica pod running the all-in-one image (frontend + agent-server + automation). |
| `PersistentVolumeClaim` (per pod)   | Backs the openhands user's `$HOME` — settings, encrypted secrets, conversation history, automation SQLite DB, cloned repos under `~/workspace`, generated keys, dotfiles. |
| `Service` (`ClusterIP` by default)  | Cluster-internal endpoint on port 8000.                                            |
| `Service` (headless)                | Required by the `StatefulSet` for stable pod DNS.                                  |
| `ServiceAccount`                    | Stable identity the pod runs under. Bindings depend on `rbac.*`.                   |
| `Ingress` (optional)                | External HTTP(S) entry point with the usual class/annotations/TLS knobs.           |
| `RoleBinding` (per namespace)       | When `rbac.enabled=true`, one per entry in `rbac.namespaces`, bound to the built-in `admin` ClusterRole. |
| `ClusterRoleBinding` (optional)     | When `rbac.clusterAdmin=true`, binds the SA to `cluster-admin` cluster-wide.       |

## Persistence

`persistence.mountPath` defaults to `/home/openhands` — the running
user's HOME inside the upstream image (UID 1000, `HOME=/home/openhands`).
Mounting the whole HOME (rather than just `~/.openhands`) means every
piece of durable state the container writes survives pod restarts,
rescheduling, and image upgrades:

- `~/.openhands` — agent-server settings, encrypted secrets,
  conversation history and event stores, automation SQLite database
  (unless `config.automationDbUrl` is set), auto-generated
  `OH_SECRET_KEY`, session API key
- `~/workspace` — the agent's default working directory: cloned repos,
  worktrees, anything the agent writes when it treats `~` as the
  workspace
- any other dotfiles the running user creates (`~/.gitconfig`,
  `~/.cache`, `~/.local`, etc.)

The upstream image doesn't ship any dotfiles or venvs under
`/home/openhands` (Python packages are `--system`-installed under
`/opt/agent-canvas`), so mounting an empty PVC over HOME on first boot
is safe — the entrypoint re-creates the `.openhands` subtree it needs.

Point at an existing PVC with `persistence.existingClaim=<name>` if you
manage the volume out of band; otherwise the chart uses the
`StatefulSet`'s `volumeClaimTemplates` (recommended — data survives pod
rescheduling and image upgrades).

## RBAC

RBAC is **off by default** — the pod runs under its own ServiceAccount
but has no in-cluster permissions.

Two independent switches:

```yaml
rbac:
  enabled: true
  # Full access to all resources in these namespaces (bound to the
  # built-in `admin` ClusterRole via one RoleBinding per namespace).
  namespaces:
    - default
    - agent-sandbox
  # Optionally grant cluster-admin. OFF by default. Very broad — enable
  # only when the agent truly needs to manage the whole cluster.
  clusterAdmin: false
```

- `rbac.namespaces` creates one `RoleBinding` per namespace, referencing
  the built-in `admin` ClusterRole. Those namespaces must already exist
  in the cluster.
- `rbac.clusterAdmin=true` creates an additional `ClusterRoleBinding` to
  `cluster-admin`. This overrides / supersedes any per-namespace grant.

## Ingress

Standard knobs:

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: agent-canvas.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - agent-canvas.example.com
      secretName: agent-canvas-tls
```

The agent-server uses WebSockets on `/sockets`, so long
`proxy-read-timeout` / `proxy-send-timeout` values are recommended when
using `ingress-nginx`. File uploads honor `proxy-body-size`.

## Common overrides

Provide an LLM key via secret:

```yaml
config:
  extraEnv:
    - name: LLM_MODEL
      value: openhands/claude-sonnet-4-5-20250929
    - name: LLM_API_KEY
      valueFrom:
        secretKeyRef:
          name: my-llm-secret
          key: api-key
```

Bring your own `OH_SECRET_KEY` (must match the value used to encrypt any
existing PVC contents):

```yaml
secrets:
  ohSecretKey:
    existingSecret: agent-canvas-keys
    key: ohSecretKey
```

Point automation at an external Postgres:

```yaml
config:
  automationDbUrl: postgresql+asyncpg://user:pass@postgres/agentcanvas
```

## Uninstall

```bash
helm uninstall agent-canvas
```

By default the PVC created by `volumeClaimTemplates` is **retained**
after uninstall — delete it manually if you want the data gone. Set
`statefulSet.persistentVolumeClaimRetentionPolicy` (Kubernetes 1.27+) if
you want the PVC lifecycle tied to the StatefulSet.
