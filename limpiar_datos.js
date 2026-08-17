const fs = require('fs');

// Las 6 rutas inconclusas que investigamos
const rutasObjetivo = ["3", "5", "11", "18", "22", "34"];

console.log("Leyendo archivo original...");
const rawData = fs.readFileSync('vial_nacional.geojson', 'utf8');
const geojson = JSON.parse(rawData);

console.log("Filtrando rutas...");
// Nos quedamos solo con los trazos cuyo 'rtn' coincida con nuestras rutas
geojson.features = geojson.features.filter(feature => {
    return feature.properties && rutasObjetivo.includes(feature.properties.rtn);
});

// Guardamos el resultado en un archivo nuevo y liviano
fs.writeFileSync('rutas_inconclusas.geojson', JSON.stringify(geojson));
console.log(`¡Listo! Se guardaron ${geojson.features.length} tramos en 'rutas_inconclusas.geojson'.`);