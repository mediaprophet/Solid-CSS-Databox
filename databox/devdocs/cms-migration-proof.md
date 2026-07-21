# Databox CMS live migration proof

This harness is the practical live version of `CmsMigrationProof`: it proves that CMS operating state can move as
portable Solid/RDF "works" rather than CSS-private state.

The invariant is unchanged:

- the file-backed CSS pod is the canonical source;
- the exported bundle is ordinary CMS works JSON plus RDF module state;
- the Oxigraph-backed CSS profile is a rebuildable SPARQL environment over those works;
- public discovery is still standard Solid RDF via the Databox CMS Type Index;
- vanilla Solid degradation reads the same resources without requiring CSS-enhanced control-plane routes.

The harness does not fake a live endpoint. If CSS or Oxigraph are absent, optional mode exits with a skip message.

## Dry-run the command plan

Unified Oxigraph endpoint:

```powershell
node .\scripts\run-cms-migration-proof.mjs --mode=unified --start-css --start-oxigraph --dry-run
```

Split query/update endpoints:

```powershell
node .\scripts\run-cms-migration-proof.mjs --mode=split --start-css --start-oxigraph --dry-run
```

The dry-run JSON form is useful for CI assertions and swarm handoff review:

```powershell
node .\scripts\run-cms-migration-proof.mjs --mode=split --start-css --start-oxigraph --dry-run --format=json
```

## Run by letting the harness launch CSS and Oxigraph

Install Oxigraph first, for example:

```powershell
cargo install oxigraph-cli
```

Then run:

```powershell
node .\scripts\run-cms-migration-proof.mjs --mode=unified --start-css --start-oxigraph
```

or:

```powershell
node .\scripts\run-cms-migration-proof.mjs --mode=split --start-css --start-oxigraph
```

By default this starts:

- source CSS: `node bin/server.js -c config/cms/cms-file.json --baseUrl http://127.0.0.1:4860/`;
- target CSS: `node bin/server.js -c config/cms/cms-sparql.json` or `config/cms/cms-oxigraph.json` at
  `http://127.0.0.1:4861/`;
- Oxigraph: `oxigraph serve --bind 127.0.0.1:7878 --cors`.

The harness writes a marker to the source hosting module state, exports `/.databox/cms/works`, imports that bundle
into the target profile at `/.databox/cms/works/import`, then reads the target works bundle and public
`.well-known/databox-cms` Type Index resources.

## Run against already-started endpoints

Start a file-backed CMS source yourself:

```powershell
node .\bin\server.js -c config/cms/cms-file.json `
  --baseUrl http://127.0.0.1:4860/ `
  --rootFilePath .data/cms-migration/source `
  --cmsControlToken cms-migration-control-token-00000001
```

Start a target CMS profile against a unified SPARQL endpoint:

```powershell
node .\bin\server.js -c config/cms/cms-sparql.json `
  --baseUrl http://127.0.0.1:4861/ `
  --rootFilePath .data/cms-migration/target `
  --sparqlEndpoint http://127.0.0.1:7878/sparql `
  --cmsControlToken cms-migration-control-token-00000001
```

Then run:

```powershell
node .\scripts\run-cms-migration-proof.mjs `
  --mode=unified `
  --source-base-url=http://127.0.0.1:4860/ `
  --target-base-url=http://127.0.0.1:4861/ `
  --endpoint=http://127.0.0.1:7878/sparql
```

For split Oxigraph-style endpoints:

```powershell
node .\scripts\run-cms-migration-proof.mjs `
  --mode=split `
  --source-base-url=http://127.0.0.1:4860/ `
  --target-base-url=http://127.0.0.1:4861/ `
  --query-endpoint=http://127.0.0.1:7878/query `
  --update-endpoint=http://127.0.0.1:7878/update
```

## Environment knobs

Oxigraph endpoints:

- `DATABOX_CMS_OXIGRAPH_SPARQL_ENDPOINT`
- `DATABOX_CMS_OXIGRAPH_QUERY_ENDPOINT`
- `DATABOX_CMS_OXIGRAPH_UPDATE_ENDPOINT`
- `CSS_SPARQL_ENDPOINT`
- `CSS_SPARQL_UPDATE_ENDPOINT`

Optional skip mode:

- `DATABOX_CMS_MIGRATION_SKIP_UNAVAILABLE=1`
- or `--skip-when-unavailable`

Control token:

- `CSS_CMS_CONTROL_TOKEN`
- or `--control-token`, `--source-control-token`, `--target-control-token`

Launch/data overrides:

- `--source-port`, `--target-port`
- `--source-base-url`, `--target-base-url`
- `--source-data-path`, `--target-data-path`
- `--oxigraph-bind`, `--oxigraph-location`, `--oxigraph-command`
- `--timeout-ms`

## What this proves

On a successful live run, the harness has exercised the real CSS control-plane routes and standard discovery
resources:

1. source file-backed CMS state was written through `/.databox/cms/modules/hosting`;
2. portable works were exported from `/.databox/cms/works`;
3. the same works were imported into an Oxigraph/SPARQL-backed CSS profile;
4. the target profile exposed the migrated module through both `/.databox/cms/works` and
   `.well-known/databox-cms`;
5. Oxigraph was treated only as a replaceable query backend.

This is still not a claim that Oxigraph is canonical storage. The portable object is the Solid/RDF works bundle and
the public Type Index-discoverable RDF resources. Oxigraph can be dropped and rebuilt from those resources.
