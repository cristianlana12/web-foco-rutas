// 1. VARIABLES GLOBALES Y CONFIGURACIÓN
let datosRutasGeoJSON = null; 
let animacionId = null;       
let pasoActualIndex = 0; 

const coloresRutas = {
    'ruta3': '#d94838',  
    'ruta5': '#e67e22',  
    'ruta11': '#2980b9', 
    'ruta18': '#27ae60', 
    'ruta22': '#8e44ad', 
    'ruta34': '#f1c40f'  
};

const todasLasRutas = [
    { numero: 3, color: coloresRutas.ruta3 },
    { numero: 5, color: coloresRutas.ruta5 },
    { numero: 11, color: coloresRutas.ruta11 },
    { numero: 18, color: coloresRutas.ruta18 },
    { numero: 22, color: coloresRutas.ruta22 },
    { numero: 34, color: coloresRutas.ruta34 }
];

// 2. CARGAR LOS DATOS EN MEMORIA
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


// 3. INICIALIZAR EL MAPA
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
    zoom: 3.5
    // Eliminamos el interactive: false
});

// Agregamos los botones de zoom (+/-) y la brújula arriba a la derecha
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Opcional: Desactivar el zoom con la rueda del mouse para que al scrollear
// los textos, si el cursor está sobre el mapa, no se aleje/acerque sin querer.
map.scrollZoom.disable();


// 4. CONFIGURAR LAS CAPAS AL CARGAR EL MAPA
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
            'line-color': '#b3b3b3',
            'line-width': 3,
            'line-opacity': 0.5
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


// 5. MOTOR DE ANIMACIÓN MULTI-RUTA CON VELOCIDAD DINÁMICA
function dibujarRutas(listaRutasConfigs) {
    if (!datosRutasGeoJSON) return;
    if (!map.getSource('ruta-animada')) return;

    if (animacionId) cancelAnimationFrame(animacionId);

    let rutasAAnimar = [];
    const FRAMES_DESEADOS = 120; // 120 fotogramas = ~2 segundos de animación para que terminen juntas

    listaRutasConfigs.forEach(config => {
        const numeroStr = String(config.numero).trim();
        const tramos = datosRutasGeoJSON.features.filter(f => f.properties && String(f.properties.rtn).trim() === numeroStr);

        if (tramos.length > 0) {
            let segmentos = [];
            let totalPuntosEnRuta = 0; // Sumador para saber qué tan larga es

            tramos.forEach(feature => {
                if (feature.geometry.type === 'LineString') {
                    segmentos.push(feature.geometry.coordinates);
                    totalPuntosEnRuta += feature.geometry.coordinates.length;
                } else if (feature.geometry.type === 'MultiLineString') {
                    feature.geometry.coordinates.forEach(s => {
                        segmentos.push(s);
                        totalPuntosEnRuta += s.length;
                    });
                }
            });

            // Ordenamiento Geográfico
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

            // CÁLCULO DE VELOCIDAD DINÁMICA: (Total de puntos / Tiempo deseado)
            // La ruta 3 tendrá una velocidad alta, la ruta 18 una velocidad baja.
            let velocidadPersonalizada = totalPuntosEnRuta / FRAMES_DESEADOS;
            if (velocidadPersonalizada < 0.5) velocidadPersonalizada = 0.5; // Velocidad mínima

            rutasAAnimar.push({
                color: config.color,
                segmentos: segmentos,
                indiceSegmento: 0,
                indiceCoordenada: 0,
                lineasTerminadas: [],
                velocidad: velocidadPersonalizada // Asignamos su velocidad propia
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
                
                // Usamos la velocidad propia calculada para esta ruta en específico
                ruta.indiceCoordenada += ruta.velocidad;

                if (ruta.indiceCoordenada >= segmentoActual.length) {
                    ruta.lineasTerminadas.push(segmentoActual);
                    ruta.indiceSegmento++;
                    ruta.indiceCoordenada = 0;
                }
            }

            let lineasParaMostrar = [...ruta.lineasTerminadas];
            if (ruta.indiceSegmento < ruta.segmentos.length) {
                // Usamos Math.floor porque la velocidad puede tener decimales (ej. 1.5 puntos por cuadro)
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


// 6. CONTROLADOR DE PASOS Y SCROLLAMA
function ejecutarPaso(index) {
    pasoActualIndex = index;
    const opcionesVuelo = {
        duration: 3000, 
        essential: true,
        curve: 1.2
    };

    switch(index) {
        case 0: 
            map.flyTo({ center: [-65.0, -40.0], zoom: 3.5, pitch: 0, ...opcionesVuelo });
            if (map.getSource('ruta-animada')) {
                map.getSource('ruta-animada').setData({ type: 'FeatureCollection', features: [] });
            }
            break;

        case 1: // Ruta 3 ajustada
            map.flyTo({ center: [-65.0, -44.0], zoom: 4.0, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 3, color: coloresRutas.ruta3 }]);
            break;

        case 2: 
            map.flyTo({ center: [-61.5, -35.5], zoom: 6, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 5, color: coloresRutas.ruta5 }]);
            break;

        case 3: // Cierre balanceado
            map.flyTo({ center: [-65.0, -40.0], zoom: 3.5, pitch: 0, ...opcionesVuelo });
            dibujarRutas(todasLasRutas);
            break;
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
        offset: 0.6,
        debug: false
    }).onStepEnter(handleStepEnter);
    
    window.addEventListener('resize', scroller.resize);
}

window.onload = init;