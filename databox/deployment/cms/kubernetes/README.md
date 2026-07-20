# Kubernetes CMS Manifest Skeleton

These manifests are a deployment starting point, not a full production chart. Replace `databox.example.org`,
image names, storage class choices, and secret-management wiring before applying them.

The manifests keep the CMS profile opt-in by setting `CSS_CONFIG=config/cms/cms-file.json` only in the CMS
Deployment. They mount persistent data at `/data` and read the CMS control token from a Kubernetes Secret.

Device mTLS needs special routing: do not put `devices.<apex>` behind a normal TLS-terminating Ingress unless
client certificate identity is explicitly forwarded and verified. Prefer a separate direct-TLS listener or a
dedicated edge-mTLS design.

Run static validation from the repo root:

```sh
npm run test:cms:deployment
```
