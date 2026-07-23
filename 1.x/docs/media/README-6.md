# Databox CMS Deployment Proof Slice

This directory contains opt-in deployment artifacts for the Databox CMS profile. They do not change the
default Community Solid Server install path, and they do not bake operator secrets into container images.

## Docker Compose

Build the image locally:

```sh
docker build -t solid-databox:local .
```

Prepare local deployment values from this directory:

```sh
cp .env.example .env
mkdir -p secrets
openssl rand -base64 48 > secrets/cms_control_token.txt
node ../../../scripts/validate-cms-deployment.mjs --env-file .env
```

Start the opt-in CMS profile:

```sh
docker compose --profile cms --env-file .env -f docker-compose.cms.yml up -d
```

The compose profile mounts persistent Solid data at `/data`, runs `config/cms/cms-file.json`, and reads the
CMS control token from a Docker secret file. The local image remains capable of running a basic CSS install
because CMS behavior is selected only through the deployment profile and `CSS_CONFIG`.

## Kubernetes Manifests

The `kubernetes/` directory is a plain manifest skeleton because this repo does not currently have a Helm chart
pattern to extend. It includes a Deployment, Service, PVC, ConfigMap, Secret example, and Ingress placeholder.
Apply it only after replacing placeholder hosts and using your cluster's secret-management path.

The skeleton intentionally sets `replicas: 1`. Multi-replica CMS/CSS needs a shared backend and distributed
locker; the in-memory defaults are not an HA configuration.

## Required Values

- `CSS_BASE_URL`: public Databox base URL, normally `https://databox.<apex>/`.
- `CSS_CONFIG`: `config/cms/cms-file.json` for persistent CMS file storage.
- `CSS_ROOT_FILE_PATH`: `/data` in containers.
- `CMS_CONTROL_TOKEN_FILE` or a Kubernetes Secret named `cms-control-token`: a 32+ byte random token.

## Device Direct-TLS Caveat

Do not route future `devices.<apex>` mTLS traffic through a TLS-terminating reverse proxy or proxied
Cloudflare route unless the edge explicitly preserves client certificate identity. Device client-cert auth
needs a direct-TLS path, such as a dedicated non-proxied listener/port, or an edge-mTLS design with explicit
certificate forwarding and verification. The CMS web/admin route can sit behind ordinary TLS termination; the
device identity route cannot assume that.

## Connector Runtime Planning

Enterprise ODBC/LDAP/R2RML connectors are split into two layers:

- Portable connector manifests and jobs are ordinary Solid/RDF CMS works. They name the source kind, mapper
  work, target pod/container, job mode, conflict policy, and cursor resource.
- Runtime descriptors are non-portable operator state. They name the sidecar engine and secret references, but
  never inline ODBC DSNs, LDAP bind passwords, connection strings, container host paths, or local binary paths
  into portable RDF.

`ConnectorRuntimePlan` turns those two layers into a command descriptor for a Rust sidecar, native binary,
container, or managed adapter. It currently plans one-time imports, one-way source-to-pod live sync, and
read-only virtual/federated query mode without adding real ODBC/LDAP dependencies.

LDAP/AD connector jobs are directory data import jobs via the mapper. Login federation is a separate OIDC/SAML
bridge and must not be implemented as an LDAP connector job.

## Validation

Template checks run without Docker or Kubernetes:

```sh
npm run test:cms:deployment
```

Runtime value checks are opt-in:

```sh
node scripts/validate-cms-deployment.mjs --env-file databox/deployment/cms/.env
```
