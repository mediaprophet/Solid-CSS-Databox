const packages = [
  'arrayify-stream',
  'cookie',
  'rdf-parse',
  'rdf-serialize',
  'rdf-dereference',
  '@isaacs/ttlcache',
  'rdf-validate-shacl',
];

for (const pkg of packages) {
  try {
    const mod = require(pkg);
    console.log(`${pkg}: type=${typeof mod}, keys=${Object.keys(mod).join(',')}`);
  } catch (e) {
    console.log(`${pkg}: ERROR ${e.message}`);
  }
}
