const packages = [
  'rdf-parse',
  'rdf-serialize',
  'rdf-dereference',
  'rdf-validate-shacl',
];

for (const pkg of packages) {
  try {
    const mod = require(pkg);
    console.log(`\n=== ${pkg} ===`);
    for (const key of Object.keys(mod)) {
      const val = mod[key];
      if (val && typeof val === 'object') {
        console.log(`  ${key}: ${typeof val}, keys=${Object.keys(val).slice(0, 15).join(',')}`);
      } else {
        console.log(`  ${key}: ${typeof val}`);
      }
    }
    // Check if default export has methods
    if (mod.rdfParser) {
      console.log('  rdfParser methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mod.rdfParser)).filter(n => n !== 'constructor'));
    }
    if (mod.rdfSerializer) {
      console.log('  rdfSerializer methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mod.rdfSerializer)).filter(n => n !== 'constructor'));
    }
    if (mod.rdfDereferencer) {
      console.log('  rdfDereferencer methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mod.rdfDereferencer)).filter(n => n !== 'constructor'));
    }
  } catch (e) {
    console.log(`${pkg}: ERROR ${e.message}`);
  }
}
