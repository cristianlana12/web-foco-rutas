// 1. VARIABLES GLOBALES Y CONFIGURACIÓN DE RUTAS
let datosRutasGeoJSON = null; 
let animacionId = null;       
let pasoActualIndex = 0; 

const coloresRutas = {
    'ruta3': '#d94838',  
    'ruta5': '#e67e22',  
    'ruta11': '#2980b9', 
    'ruta18': '#27ae60', 
    'ruta22': '#8e44ad', 
    'ruta34': '#d97706'  
};

const todasLasRutas = [
    { numero: 3, color: coloresRutas.ruta3 },
    { numero: 5, color: coloresRutas.ruta5 },
    { numero: 11, color: coloresRutas.ruta11 },
    { numero: 18, color: coloresRutas.ruta18 },
    { numero: 22, color: coloresRutas.ruta22 },
    { numero: 34, color: coloresRutas.ruta34 }
];

// 2. CARGAR LOS DATOS
fetch('rutas_inconclusas.geojson')
    .then(response => {
        if (!response.ok) throw new Error("No se pudo cargar el archivo GeoJSON");
        return response.json();
    })
    .then(data => {
        datosRutasGeoJSON = data;
        console.log("GeoJSON cargado correctamente.");
        ejecutarPaso(pasoActualIndex);
    })
    .catch(error => console.error("Error al cargar el GeoJSON:", error));


// 3. INICIALIZAR EL MAPA MAPLIBRE
const map = new maplibregl.Map({
    container: 'map',
    style: {
        'version': 8,
        'sources': {
            'carto-light': {
                'type': 'raster',
                'tiles': [
                    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
                ],
                'tileSize': 256,
                'attribution': '&copy; OpenStreetMap &copy; CARTO'
            }
        },
        'layers': [
            {
                'id': 'carto-light-layer',
                'type': 'raster',
                'source': 'carto-light',
                'minzoom': 0,
                'maxzoom': 22
            }
        ]
    },
    center: [-65.0, -40.0],
    zoom: 3.8
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.scrollZoom.disable();


// 4. CONFIGURAR CAPAS DE MAPLIBRE
map.on('load', () => {
    map.addSource('rutas-base', {
        type: 'geojson',
        data: 'rutas_inconclusas.geojson' 
    });

    map.addLayer({
        id: 'capa-rutas-base',
        type: 'line',
        source: 'rutas-base',
        paint: {
            'line-color': '#c3c7cb',
            'line-width': 3,
            'line-opacity': 0.6
        }
    });

    map.addSource('ruta-animada', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id: 'capa-ruta-animada',
        type: 'line',
        source: 'ruta-animada',
        layout: {
            'line-cap': 'round',
            'line-join': 'round'
        },
        paint: {
            'line-color': ['get', 'color'], 
            'line-width': 6,               
            'line-opacity': 1
        }
    });
});


// 5. MOTOR DE ANIMACIÓN MULTI-RUTA CON VELOCIDAD Y ORDENAMIENTO DINÁMICO
function dibujarRutas(listaRutasConfigs) {
    if (!datosRutasGeoJSON) return;
    if (!map.getSource('ruta-animada')) return;

    if (animacionId) cancelAnimationFrame(animacionId);

    let rutasAAnimar = [];
    const FRAMES_DESEADOS = 120;

    listaRutasConfigs.forEach(config => {
        const numeroStr = String(config.numero).trim();
        const tramos = datosRutasGeoJSON.features.filter(f => f.properties && String(f.properties.rtn).trim() === numeroStr);

        if (tramos.length > 0) {
            let segmentos = [];
            let totalPuntos = 0;

            tramos.forEach(feature => {
                if (feature.geometry.type === 'LineString') {
                    segmentos.push(feature.geometry.coordinates);
                    totalPuntos += feature.geometry.coordinates.length;
                } else if (feature.geometry.type === 'MultiLineString') {
                    feature.geometry.coordinates.forEach(s => {
                        segmentos.push(s);
                        totalPuntos += s.length;
                    });
                }
            });

            let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
            segmentos.forEach(seg => {
                let pt = seg[0];
                if(pt[0] < minLng) minLng = pt[0];
                if(pt[0] > maxLng) maxLng = pt[0];
                if(pt[1] < minLat) minLat = pt[1];
                if(pt[1] > maxLat) maxLat = pt[1];
            });
            let esHorizontal = (maxLng - minLng) > (maxLat - minLat);
            segmentos.sort((a, b) => esHorizontal ? b[0][0] - a[0][0] : b[0][1] - a[0][1]);

            let velocidadCalculada = totalPuntos / FRAMES_DESEADOS;
            if (velocidadCalculada < 0.6) velocidadCalculada = 0.6;

            rutasAAnimar.push({
                color: config.color,
                segmentos: segmentos,
                indiceSegmento: 0,
                indiceCoordenada: 0,
                lineasTerminadas: [],
                velocidad: velocidadCalculada
            });
        }
    });

    if (rutasAAnimar.length === 0) return;

    map.getSource('ruta-animada').setData({ type: 'FeatureCollection', features: [] });

    function dibujarCuadro() {
        let todasCompletadas = true;
        let featuresNuevas = [];

        rutasAAnimar.forEach(ruta => {
            if (ruta.indiceSegmento < ruta.segmentos.length) {
                todasCompletadas = false;

                let segmentoActual = ruta.segmentos[ruta.indiceSegmento];
                ruta.indiceCoordenada += ruta.velocidad;

                if (ruta.indiceCoordenada >= segmentoActual.length) {
                    ruta.lineasTerminadas.push(segmentoActual);
                    ruta.indiceSegmento++;
                    ruta.indiceCoordenada = 0;
                }
            }

            let lineasParaMostrar = [...ruta.lineasTerminadas];
            if (ruta.indiceSegmento < ruta.segmentos.length) {
                let segmentoParcial = ruta.segmentos[ruta.indiceSegmento].slice(0, Math.floor(ruta.indiceCoordenada));
                if (segmentoParcial.length >= 2) {
                    lineasParaMostrar.push(segmentoParcial);
                }
            }

            lineasParaMostrar.forEach(coords => {
                featuresNuevas.push({
                    type: 'Feature',
                    properties: { color: ruta.color },
                    geometry: { type: 'LineString', coordinates: coords }
                });
            });
        });

        if (map.getSource('ruta-animada')) {
            map.getSource('ruta-animada').setData({
                type: 'FeatureCollection',
                features: featuresNuevas
            });
        }

        if (!todasCompletadas) {
            animacionId = requestAnimationFrame(dibujarCuadro);
        }
    }

    dibujarCuadro();
}


// 6. DIRECTOR DE CÁMARA (CONTROLADOR DE PASOS)
function ejecutarPaso(index) {
    pasoActualIndex = index;
    const opcionesVuelo = {
        duration: 2800, 
        essential: true,
        curve: 1.15
    };

    switch(index) {
        case 0: // Intro: Todo el país
            map.flyTo({ center: [-65.0, -40.0], zoom: 3.8, pitch: 0, ...opcionesVuelo });
            if (map.getSource('ruta-animada')) {
                map.getSource('ruta-animada').setData({ type: 'FeatureCollection', features: [] });
            }
            break;

        case 1: // Ruta 3 (Sur)
            map.flyTo({ center: [-65.0, -44.0], zoom: 4.1, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 3, color: coloresRutas.ruta3 }]);
            break;

        case 2: // Ruta 5 (Centro)
            map.flyTo({ center: [-61.5, -35.5], zoom: 6.2, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 5, color: coloresRutas.ruta5 }]);
            break;

        case 3: // Ruta 11 (Litoral/Norte)
            map.flyTo({ center: [-59.5, -28.8], zoom: 5.6, pitch: 15, ...opcionesVuelo });
            dibujarRutas([{ numero: 11, color: coloresRutas.ruta11 }]);
            break;

        case 4: // Ruta 18 (Entre Ríos)
            map.flyTo({ center: [-59.0, -31.6], zoom: 7.2, pitch: 15, ...opcionesVuelo });
            dibujarRutas([{ numero: 18, color: coloresRutas.ruta18 }]);
            break;

        case 5: // Ruta 22 (Alto Valle)
            map.flyTo({ center: [-65.5, -38.8], zoom: 6.0, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 22, color: coloresRutas.ruta22 }]);
            break;

        case 6: // Ruta 34 (NOA / Ejecución parcial)
            map.flyTo({ center: [-63.5, -28.2], zoom: 5.4, pitch: 15, ...opcionesVuelo });
            dibujarRutas([{ numero: 34, color: coloresRutas.ruta34 }]);
            break;

        case 7: // Panorama general consolidado
            map.flyTo({ center: [-65.0, -40.0], zoom: 3.8, pitch: 0, ...opcionesVuelo });
            dibujarRutas(todasLasRutas);
            break;
    }
}

// REDIRECCIÓN Y DESPLAZAMIENTO DESDE EL MINI MENÚ
function irARuta(pasoIndex) {
    const elTarget = document.getElementById(`step-${pasoIndex}`);
    if (elTarget) {
        elTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

const scroller = scrollama();

function handleStepEnter(response) {
    const steps = document.querySelectorAll('.step');
    steps.forEach(step => step.classList.remove('is-active'));
    response.element.classList.add('is-active');

    ejecutarPaso(response.index);
}

function init() {
    scroller.setup({
        step: '.step',
        offset: 0.55,
        debug: false
    }).onStepEnter(handleStepEnter);
    
    window.addEventListener('resize', scroller.resize);
}

window.onload = init;