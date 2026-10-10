// 1. VARIABLES GLOBALES Y CONFIGURACIÃ“N DE RUTAS
let datosRutasGeoJSON = null;
let animacionId = null;
let pasoActualIndex = 0;

const coloresRutas = {
    'ruta3': '#6E2A33',
    'ruta5': '#DF741B',
    'ruta11': '#206795',
    'ruta18': '#31824A',
    'ruta22': '#674199',
    'ruta34': '#E3A711'
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


// 3. INICIALIZAR EL MAPA MAPLIBRE (FONDO BEIGE Y PROVINCIAS)
const map = new maplibregl.Map({
    container: 'map',
    style: {
        'version': 8,
        'glyphs': 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        'sources': {},
        'layers': [
            {
                'id': 'fondo-agua',
                'type': 'background',
                'paint': {
                    'background-color': '#e5e4dc'
                }
            }
        ]
    },
    center: [-65.0, -40.0],
    zoom: zoomResp(3.8, 4.0)
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.scrollZoom.disable();

// 4. CONFIGURAR CAPAS DE MAPLIBRE
map.on('load', () => {

    // 1. Agregar fuentes de datos (GeoJSON)
    map.addSource('provincias', { type: 'geojson', data: 'provincias.geojson' });
    map.addSource('paises', { type: 'geojson', data: 'paises_limitrofes.geojson' });
    
    map.addSource('rutas-base', {
        type: 'geojson',
        data: 'vial_nacional.geojson'
    });

    map.addSource('ruta-animada', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addSource('ciudades', {
        type: 'geojson',
        data: 'ciudades_rutas.geojson'
    });

    // 2. Agregar capas en el orden correcto (de abajo hacia arriba)

    // Paises limitrofes
    map.addLayer({
        id: 'capa-paises-fill',
        type: 'fill',
        source: 'paises',
        paint: {
            'fill-color': '#efede6'
        }
    });
    map.addLayer({
        id: 'capa-paises-line',
        type: 'line',
        source: 'paises',
        paint: {
            'line-color': '#b2afa8',
            'line-width': 1.0
        }
    });

    // Provincias
    map.addLayer({
        id: 'capa-provincias-fill',
        type: 'fill',
        source: 'provincias',
        paint: {
            'fill-color': '#dddad3'
        }
    });
    map.addLayer({
        id: 'capa-provincias-line',
        type: 'line',
        source: 'provincias',
        paint: {
            'line-color': '#b9b4a9',
            'line-width': 1.0
        }
    });

    // A. Líneas grises de fondo (Todas las rutas)
    map.addLayer({
        id: 'capa-rutas-base',
        type: 'line',
        source: 'rutas-base',
        paint: {
            'line-color': '#d1d5db',
            'line-width': 2.5,
            'line-opacity': 0.5
        }
    });

    // Etiquetas Paises
    map.addLayer({
        id: 'capa-paises-labels',
        type: 'symbol',
        source: 'paises',
        layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['Open Sans Regular'],
            'text-size': 12,
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.2
        },
        paint: {
            'text-color': '#a9a498',
            'text-halo-color': '#efede6',
            'text-halo-width': 1.5
        }
    });

    // Etiquetas Provincias
    map.addLayer({
        id: 'capa-provincias-labels',
        type: 'symbol',
        source: 'provincias',
        layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['Open Sans Regular'],
            'text-size': 10,
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.1
        },
        paint: {
            'text-color': '#a9a498',
            'text-halo-color': '#dddad3',
            'text-halo-width': 1.5
        },
        filter: ['!=', ['get', 'nombre'], 'Ciudad Autónoma de Buenos Aires']
    });

    // C. Línea de color animada (La ruta activa) -> DEBE ESTAR ARRIBA DE TODO
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
            'line-width': 5,
            'line-opacity': 1
        }
    });

    // Etiquetas Ciudades (sobre rutas)
    map.addLayer({
        id: 'capa-ciudades',
        type: 'symbol',
        source: 'ciudades',
        layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['Open Sans Semibold'],
            'text-size': 14,
            'text-anchor': 'top',
            'text-offset': [0, 0.5]
        },
        paint: {
            'text-color': '#333333',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        },
        filter: ['==', 'ruta', -1] // Oculto por defecto
    });
});
// 5. MOTOR DE ANIMACIÃ“N MULTI-RUTA CON VELOCIDAD Y ORDENAMIENTO DINÃMICO
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
                if (pt[0] < minLng) minLng = pt[0];
                if (pt[0] > maxLng) maxLng = pt[0];
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
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


// Zoom responsivo: en mobile (<= 900px) usa un valor propio para que el mapa se vea grande
function zoomResp(desktop, mobile) {
    return window.innerWidth <= 900 ? mobile : desktop;
}

// 6. DIRECTOR DE CÃMARA (CONTROLADOR DE PASOS)
function ejecutarPaso(index) {
    pasoActualIndex = index;
    const opcionesVuelo = {
        duration: 2800,
        essential: true,
        curve: 1.15
    };

    switch (index) {
        case 0: // Intro: Todo el país
            map.flyTo({ center: [-65.0, -40.0], zoom: zoomResp(3.8, 4.0), pitch: 0, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', -1]);
            if (map.getSource('ruta-animada')) {
                map.getSource('ruta-animada').setData({ type: 'FeatureCollection', features: [] });
            }
            break;

        case 1: // Ruta 3 (Sur)
            map.flyTo({ center: [-65.0, -44.0], zoom: zoomResp(4.0, 3.8), pitch: 20, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', 3]);
            dibujarRutas([{ numero: 3, color: coloresRutas.ruta3 }]);
            break;

        case 2: // Ruta 5 (Centro)
            map.flyTo({ center: [-61.5, -35.5], zoom: zoomResp(6.0, 5.4), pitch: 20, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', 5]);
            dibujarRutas([{ numero: 5, color: coloresRutas.ruta5 }]);
            break;

        case 3: // Ruta 11 (Litoral/Norte)
            map.flyTo({ center: zoomResp([-59.5, -28.8], [-59.5, -29.5]), zoom: zoomResp(5.4, 5.4), pitch: 15, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', 11]);
            dibujarRutas([{ numero: 11, color: coloresRutas.ruta11 }]);
            break;

        case 4: // Ruta 18 (Entre Ríos)
            map.flyTo({ center: [-59.0, -31.6], zoom: zoomResp(7.0, 6.4), pitch: 15, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', 18]);
            dibujarRutas([{ numero: 18, color: coloresRutas.ruta18 }]);
            break;

        case 5: // Ruta 22 (Alto Valle)
            map.flyTo({ center: zoomResp([-65.5, -38.8], [-66.2, -38.8]), zoom: zoomResp(5.8, 4.9), pitch: 20, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', 22]);
            dibujarRutas([{ numero: 22, color: coloresRutas.ruta22 }]);
            break;

        case 6: // Ruta 34 (NOA / Ejecución parcial)
            map.flyTo({ center: zoomResp([-63.5, -29.5], [-62.5, -27.5]), zoom: zoomResp(4.4, 4.8), pitch: 15, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', 34]);
            dibujarRutas([{ numero: 34, color: coloresRutas.ruta34 }]);
            break;

        case 7: // Panorama general consolidado
            map.flyTo({ center: [-65.0, -40.0], zoom: zoomResp(3.8, 4.0), pitch: 0, ...opcionesVuelo });
            if (map.getLayer('capa-ciudades')) map.setFilter('capa-ciudades', ['==', 'ruta', -1]);
            dibujarRutas(todasLasRutas);
            break;
    }
}

// REDIRECCIÃ“N Y DESPLAZAMIENTO DESDE EL MINI MENÃš
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

// FUNCIÃ“N PARA INTERACTUAR AL HACER CLIC EN CUALQUIER ITEM DE LA PILA
// FUNCIÃ“N PARA INTERACTUAR AL HACER CLIC EN CUALQUIER ITEM O BOTÃ“N
function seleccionarRuta(index, nombre, trayecto, km, descripcion) {
    // 1. Ejecuta la animaciÃ³n del mapa hacia esa ruta (o panorama general)
    ejecutarPaso(index);

    // 2. Actualiza el recuadro gris (si existe)
    const infoDinamica = document.getElementById('info-dinamica');
    if (infoDinamica) {
        infoDinamica.style.opacity = 0;
        setTimeout(() => {
            // Condicional para adaptar el texto si es una ruta especÃ­fica o el panorama general
            if (km && trayecto) {
                infoDinamica.innerHTML = `
                    <h3>${nombre} (${km})</h3>
                    <p><strong>${trayecto}:</strong> ${descripcion}</p> 
                `;
            } else {
                infoDinamica.innerHTML = `
                    <h3>${nombre}</h3>
                    <p>${descripcion}</p>
                `;
            }
            infoDinamica.style.opacity = 1;
        }, 180);
    }

    // 3. Actualiza el badge inferior con el color de la ruta (si es que la estÃ¡s usando)
    const badge = document.getElementById('pila-active-badge');
    if (badge) {
        badge.innerText = nombre;
        // Si el index es 7 (Panorama General), usa un gris oscuro. Si no, busca el color de la ruta.
        let color = '#4b5563';
        if (index > 0 && index < 7) {
            color = coloresRutas[`ruta${todasLasRutas[index - 1]?.numero}`] || '#31824A';
        }
        badge.style.backgroundColor = color;
    }
}

// ==========================================
// 8. LÃ“GICA DE LAS PESTAÃ‘AS (TABS) DE RUTAS
// ==========================================
function cambiarTab(elemento) {
    // 1. Quitar la clase activa y los colores en lÃ­nea de todas las pestaÃ±as superiores
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.classList.remove('is-active');
        tab.style.backgroundColor = ''; 
        tab.style.color = '';
    });

    // 2. Activar la pestaÃ±a clickeada
    elemento.classList.add('is-active');
    const colorHex = elemento.getAttribute('data-color');
    elemento.style.backgroundColor = colorHex;
    elemento.style.color = '#ffffff';

    // 3. Cambiar el color del borde izquierdo del contenedor
    const contentArea = document.getElementById('tab-content-area');
    contentArea.style.borderLeftColor = colorHex;

    // 4. OCULTAR TODOS LOS PANELES Y MOSTRAR SOLO EL SELECCIONADO
    const rutaId = elemento.getAttribute('data-ruta');
    const paneles = document.querySelectorAll('.tab-pane');
    
    paneles.forEach(pane => {
        pane.style.display = 'none';
        pane.classList.remove('is-active');
    });
    
    const paneActivo = document.getElementById('pane-ruta-' + rutaId);
    if (paneActivo) {
        paneActivo.style.display = 'block';
        
        // PequeÃ±o truco para que aparezca con un fade suave
        setTimeout(() => {
            paneActivo.classList.add('is-active');
        }, 50);
    }
}

// Inicializar el color de la primera pestaÃ±a al cargar la pÃ¡gina
document.addEventListener('DOMContentLoaded', () => {
    const primerTab = document.querySelector('.tab-btn.is-active');
    if (primerTab) {
        const colorInicial = primerTab.getAttribute('data-color');
        primerTab.style.backgroundColor = colorInicial;
        primerTab.style.color = '#ffffff';
    }
});

// ==========================================
// 9. CONTROLADOR DE REPRODUCTORES DE AUDIO
// ==========================================
function toggleAudio(audioId, btnElement) {
    const audioElement = document.getElementById(audioId);
    const iconPlay = btnElement.querySelector('.icon-play');
    const iconPause = btnElement.querySelector('.icon-pause');
    const waveform = btnElement.nextElementSibling; // Selecciona la onda de sonido

    // Verifica si el archivo de audio fue cargado
    if (!audioElement.src || audioElement.src === window.location.href) {
        alert("AcÃ¡ se reproducirÃ¡ el audio cuando agregues la ruta del archivo MP3 en el HTML.");
        return;
    }

    if (audioElement.paused) {
        // Reproducir
        audioElement.play();
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        waveform.style.opacity = '1'; // "Enciende" la onda
    } else {
        // Pausar
        audioElement.pause();
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        waveform.style.opacity = '0.5'; // "Apaga" la onda
    }

    // Cuando el audio termine, volver al estado inicial
    audioElement.onended = function() {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        waveform.style.opacity = '0.5';
    };
}
