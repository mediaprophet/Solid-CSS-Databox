const mod = require('rdf-validate-shacl');
console.log('rdf-validate-shacl:', typeof mod, Object.keys(mod));
if (mod.default) {
  console.log('default:', typeof mod.default, mod.default.name);
  const proto = mod.default.prototype;
  if (proto) {
    console.log('methods:', Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor'));
  }
}
