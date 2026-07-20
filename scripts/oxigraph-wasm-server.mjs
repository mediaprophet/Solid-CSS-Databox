#!/usr/bin/env node

import http from 'node:http';
import oxigraph from 'oxigraph';

let bind = '127.0.0.1:7878';
const bindIdx = process.argv.indexOf('--bind');
if (bindIdx !== -1 && process.argv[bindIdx + 1]) {
  bind = process.argv[bindIdx + 1];
}
const [ host, portStr ] = bind.split(':');
const port = parseInt(portStr || '7878', 10);

const store = new oxigraph.Store();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
}

function termToNTriples(term) {
  if (term.termType === 'NamedNode') {
    return `<${term.value}>`;
  }
  if (term.termType === 'BlankNode') {
    return `_:${term.value}`;
  }
  if (term.termType === 'Literal') {
    let s = JSON.stringify(term.value);
    if (term.language) {
      s += `@${term.language}`;
    } else if (term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
      s += `^^<${term.datatype.value}>`;
    }
    return s;
  }
  throw new Error(`Unsupported term type: ${term.termType}`);
}

function formatSparqlJson(result) {
  if (typeof result === 'boolean') {
    return JSON.stringify({
      head: {},
      boolean: result,
    });
  }

  // If it's a SELECT query, result is an array of Maps
  const uniqueVars = new Set();
  const bindings = result.map(binding => {
    const formatted = {};
    for (const [key, term] of binding.entries()) {
      uniqueVars.add(key);
      formatted[key] = {
        type: term.termType === 'NamedNode' ? 'uri' :
              term.termType === 'BlankNode' ? 'bnode' :
              term.termType === 'Literal' ? 'literal' : 'literal',
        value: term.value,
      };
      if (term.termType === 'Literal') {
        if (term.language) {
          formatted[key].xmlLang = term.language;
        } else if (term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
          formatted[key].datatype = term.datatype.value;
        }
      }
    }
    return formatted;
  });

  return JSON.stringify({
    head: {
      vars: Array.from(uniqueVars),
    },
    results: {
      bindings,
    },
  });
}

function getQueryType(query) {
  const stripped = query.replace(/#[^\r\n]*/g, '');
  const normalized = stripped.replace(/\s+/g, ' ').trim();
  let current = normalized;
  while (true) {
    const match = current.match(/^(?:PREFIX|BASE)\s+[^\s>]*(?:\s*<[^>]*>)?\s*/i);
    if (!match) {
      break;
    }
    current = current.slice(match[0].length);
  }
  const firstWord = current.split(' ')[0].toUpperCase();
  return ['SELECT', 'ASK', 'CONSTRUCT', 'DESCRIBE'].includes(firstWord) ? firstWord : 'SELECT';
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'HEAD') {
    if (['/sparql', '/query', '/update'].includes(pathname)) {
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
    return;
  }

  // Helper to read post body
  const readBody = () => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });

  try {
    let query = '';
    let update = '';

    if (req.method === 'GET') {
      query = url.searchParams.get('query') || '';
      update = url.searchParams.get('update') || '';
    } else if (req.method === 'POST') {
      const body = await readBody();
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(body);
        query = params.get('query') || '';
        update = params.get('update') || '';
      } else if (contentType.includes('application/sparql-query')) {
        query = body;
      } else if (contentType.includes('application/sparql-update')) {
        update = body;
      } else {
        // Fallback or default form param parsing
        try {
          const params = new URLSearchParams(body);
          query = params.get('query') || '';
          update = params.get('update') || '';
        } catch {
          query = body;
        }
      }
    }

    if (pathname === '/sparql' || pathname === '/query') {
      if (query) {
        console.log(`[Oxigraph-WASM] QUERY: ${query.trim()}`);
        const queryType = getQueryType(query);
        const result = store.query(query);
        if (queryType === 'CONSTRUCT' || queryType === 'DESCRIBE') {
          // CONSTRUCT query (or DESCRIBE)
          const ntriples = result.map(quad => {
            const s = termToNTriples(quad.subject);
            const p = termToNTriples(quad.predicate);
            const o = termToNTriples(quad.object);
            return `${s} ${p} ${o} .`;
          }).join('\n') + '\n';
          console.log(`[Oxigraph-WASM] CONSTRUCT RESPONSE:\n${ntriples.trim()}`);
          res.writeHead(200, { 'Content-Type': 'application/n-triples' });
          res.end(ntriples);
        } else {
          // SELECT or ASK query
          const responseBody = formatSparqlJson(result);
          console.log(`[Oxigraph-WASM] SELECT/ASK RESPONSE:\n${responseBody}`);
          res.writeHead(200, { 'Content-Type': 'application/sparql-results+json' });
          res.end(responseBody);
        }
        return;
      } else if (update) {
        console.log(`[Oxigraph-WASM] UPDATE:\n${update.trim()}`);
        store.update(update);
        res.writeHead(204);
        res.end();
        return;
      }
    }

    if (pathname === '/update') {
      if (update) {
        console.log(`[Oxigraph-WASM] UPDATE:\n${update.trim()}`);
        store.update(update);
        res.writeHead(204);
        res.end();
        return;
      }
    }

    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing query or update parameter, or invalid path.');
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, host, () => {
  console.log(`Oxigraph WASM Server running at http://${host}:${port}`);
});
