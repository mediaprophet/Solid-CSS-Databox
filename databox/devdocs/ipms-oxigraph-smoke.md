# Databox IPMS Oxigraph Smoke Path

This is the local proof path for the IPMS portability layer over a SPARQL backend. The live Jest smoke writes
module RDF state through CSS, exports the portable IPMS works bundle, imports an extra module, and confirms that the
RDF state round-trips through SPARQL storage. Normal unit and integration gates do not require Oxigraph.

For the broader file-backed CSS -> Oxigraph-backed CSS -> standard-Solid discovery migration harness, see
`databox/ipms-migration-proof.md` and `scripts/run-ipms-migration-proof.mjs`.

Oxigraph's current CLI serves read-write SPARQL over `/query`, `/update`, and a combined `/sparql` endpoint:
<https://docs.rs/crate/oxigraph-cli/latest>.

## One-command local runs

Install Oxigraph first, for example with `cargo install oxigraph-cli`, then run either profile:

```powershell
npm.cmd run test:ipms:oxigraph:unified -- --start-oxigraph
npm.cmd run test:ipms:oxigraph:split -- --start-oxigraph
```

The helper starts an in-memory Oxigraph server on `127.0.0.1:7878`, probes the query endpoint, sets the right
environment variables, and runs:

```powershell
npx.cmd jest test/integration/DataboxIpmsOxigraph.test.ts --runInBand --coverage=false
```

Use `--location ./.data/oxigraph-ipms-smoke` if you want Oxigraph's data to persist for inspection after a run.

To validate the command construction without starting Oxigraph or running Jest, use dry-run mode:

```powershell
npm.cmd run test:ipms:oxigraph:unified -- --dry-run
npm.cmd run test:ipms:oxigraph:split -- --dry-run
```

For optional local checks on machines where Oxigraph may not be installed and no container endpoint may be running,
use:

```powershell
npm.cmd run test:ipms:oxigraph:optional
```

That command exits successfully with a skip message when no endpoint or launcher is configured. When an endpoint is
configured or `--start-oxigraph` is passed, it still runs the same live smoke harness. Use the non-optional commands
above when you want a missing binary, stopped container, or unhealthy endpoint to fail loudly.

## Offline hydration/rebuild proof

Normal gates cover the non-live rebuild path in:

```powershell
npx.cmd jest test/unit/databox/ipms/OxigraphIpmsHydration.test.ts --runInBand --coverage=false
npx.cmd jest test/unit/databox/ipms/OxigraphSmokeRunner.test.ts --runInBand --coverage=false
```

That test reads canonical IPMS Turtle resources from a Solid `ResourceStore`, builds deterministic SPARQL named-graph
replacement updates, replays them into an in-memory SPARQL-like graph environment, and then replays a later Solid
write to prove the query environment is replaceable. This is intentionally not a live Oxigraph test: Oxigraph is the
hydrated query target, while Solid pod resources remain the canonical source of truth.

## Existing Oxigraph server

Unified endpoint mode uses the IPMS SPARQL profile and one endpoint for query and update:

```powershell
npm.cmd run test:ipms:oxigraph -- --mode=unified --endpoint=http://localhost:7878/sparql
```

Split endpoint mode uses the Oxigraph-style IPMS profile with separate query and update URLs:

```powershell
npm.cmd run test:ipms:oxigraph -- --mode=split `
  --query-endpoint=http://localhost:7878/query `
  --update-endpoint=http://localhost:7878/update
```

The runner also accepts the environment variable shapes used by the skipped live test:

```powershell
$env:DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT = "http://localhost:7878/sparql"
npm.cmd run test:ipms:oxigraph:unified

$env:DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT = "http://localhost:7878/query"
$env:DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT = "http://localhost:7878/update"
npm.cmd run test:ipms:oxigraph:split
```

The CSS variable aliases are also supported by the Jest test itself:

```powershell
$env:CSS_SPARQL_ENDPOINT = "http://localhost:7878/query"
$env:CSS_SPARQL_UPDATE_ENDPOINT = "http://localhost:7878/update"
npx.cmd jest test/integration/DataboxIpmsOxigraph.test.ts --runInBand --coverage=false
```

## Manual CSS profiles

The runner is only a smoke harness. To boot a developer CSS instance directly against Oxigraph, use the same
profile split:

```powershell
node .\bin\server.js -c config/ipms/ipms-sparql.json `
  --sparqlEndpoint=http://localhost:7878/sparql `
  --ipmsControlToken=12345678901234567890123456789012

node .\bin\server.js -c config/ipms/ipms-oxigraph.json `
  --sparqlEndpoint=http://localhost:7878/query `
  --sparqlUpdateEndpoint=http://localhost:7878/update `
  --ipmsControlToken=12345678901234567890123456789012
```

Use the split profile when the backend intentionally separates read and update operations. Use the unified profile
when the backend supports query and update on the same SPARQL Protocol endpoint.
