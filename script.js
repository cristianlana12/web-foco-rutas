// 1. VARIABLES GLOBALES Y CONFIGURACIÓN DE RUTAS
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
        'sources': {
            'esri-base': {
                'type': 'raster',
                'tiles': [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
                ],
                'tileSize': 256,
                'attribution': '&copy; Esri, OpenStreetMap contributors'
            },
            'esri-borders': {
                'type': 'raster',
                'tiles': [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
                ],
                'tileSize': 256
            }
        },
        'layers': [
            // 1. CAPA DE COLOR SÓLIDO (Tu color beige)
            {
                'id': 'fondo-beige',
                'type': 'background',
                'paint': {
                    'background-color': '#DDD9D0'
                }
            },
            // 2. CAPA DEL MAPA (Con opacidad baja para que se transparente el beige)
            {
                'id': 'esri-base-layer',
                'type': 'raster',
                'source': 'esri-base',
                'minzoom': 0,
                'maxzoom': 16,
                'paint': {
                    'raster-opacity': 0.55,
                    'raster-saturation': -1,
                    'raster-contrast': -0.1,
                    'raster-brightness-min': 0.3
                }
            },
            // 3. CAPA DE PROVINCIAS Y CIUDADES
            {
                'id': 'esri-borders-layer',
                'type': 'raster',
                'source': 'esri-borders',
                'minzoom': 0,
                'maxzoom': 16,
                'paint': {
                    'raster-opacity': 1,
                    'raster-saturation': -1
                }
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

    // 1. Agregar fuentes de datos (GeoJSON)
    map.addSource('rutas-base', {
        type: 'geojson',
        data: 'vial_nacional.geojson'
    });

    map.addSource('ruta-animada', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    // 2. Agregar capas en el orden correcto (de abajo hacia arriba)

    // A. Líneas grises de fondo (Todas las rutas)
    map.addLayer({
        id: 'capa-rutas-base',
        type: 'line',
        source: 'rutas-base',
        paint: {
            'line-color': '#d1d5db', // Gris un poco más claro
            'line-width': 2.5,
            'line-opacity': 0.5
        }
    });

    // B. FORZAR la capa de bordes provinciales de Esri para que esté SOBRE las líneas grises
    // (Movemos la capa 'esri-borders-layer' encima de 'capa-rutas-base' si es necesario)
    if (map.getLayer('esri-borders-layer')) {
        map.moveLayer('esri-borders-layer'); // La mueve al tope temporalmente
    }

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
            'line-width': 5, // Reduje un pelito el grosor para más elegancia
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


// 6. DIRECTOR DE CÁMARA (CONTROLADOR DE PASOS)
function ejecutarPaso(index) {
    pasoActualIndex = index;
    const opcionesVuelo = {
        duration: 2800,
        essential: true,
        curve: 1.15
    };

    switch (index) {
        case 0: // Intro: Todo el país
            map.flyTo({ center: [-65.0, -40.0], zoom: 3.8, pitch: 0, ...opcionesVuelo });
            if (map.getSource('ruta-animada')) {
                map.getSource('ruta-animada').setData({ type: 'FeatureCollection', features: [] });
            }
            break;

        case 1: // Ruta 3 (Sur)
            map.flyTo({ center: [-65.0, -44.0], zoom: 5.2, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 3, color: coloresRutas.ruta3 }]);
            break;

        case 2: // Ruta 5 (Centro)
            map.flyTo({ center: [-61.5, -35.5], zoom: 7.2, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 5, color: coloresRutas.ruta5 }]);
            break;

        case 3: // Ruta 11 (Litoral/Norte)
            map.flyTo({ center: [-59.5, -28.8], zoom: 6.6, pitch: 15, ...opcionesVuelo });
            dibujarRutas([{ numero: 11, color: coloresRutas.ruta11 }]);
            break;

        case 4: // Ruta 18 (Entre Ríos)
            map.flyTo({ center: [-59.0, -31.6], zoom: 8.2, pitch: 15, ...opcionesVuelo });
            dibujarRutas([{ numero: 18, color: coloresRutas.ruta18 }]);
            break;

        case 5: // Ruta 22 (Alto Valle)
            map.flyTo({ center: [-65.5, -38.8], zoom: 7.0, pitch: 20, ...opcionesVuelo });
            dibujarRutas([{ numero: 22, color: coloresRutas.ruta22 }]);
            break;

        case 6: // Ruta 34 (NOA / Ejecución parcial)
            map.flyTo({ center: [-63.5, -29.5], zoom: 5.6, pitch: 15, ...opcionesVuelo });
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

// FUNCIÓN PARA INTERACTUAR AL HACER CLIC EN CUALQUIER ITEM DE LA PILA
// FUNCIÓN PARA INTERACTUAR AL HACER CLIC EN CUALQUIER ITEM O BOTÓN
function seleccionarRuta(index, nombre, trayecto, km, descripcion) {
    // 1. Ejecuta la animación del mapa hacia esa ruta (o panorama general)
    ejecutarPaso(index);

    // 2. Actualiza el recuadro gris (si existe)
    const infoDinamica = document.getElementById('info-dinamica');
    if (infoDinamica) {
        infoDinamica.style.opacity = 0;
        setTimeout(() => {
            // Condicional para adaptar el texto si es una ruta específica o el panorama general
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

    // 3. Actualiza el badge inferior con el color de la ruta (si es que la estás usando)
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
// 8. LÓGICA DE LAS PESTAÑAS (TABS) DE RUTAS
// ==========================================
function cambiarTab(elemento) {
    // 1. Quitar la clase activa y los colores en línea de todas las pestañas superiores
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.classList.remove('is-active');
        tab.style.backgroundColor = ''; 
        tab.style.color = '';
    });

    // 2. Activar la pestaña clickeada
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
        
        // Pequeño truco para que aparezca con un fade suave
        setTimeout(() => {
            paneActivo.classList.add('is-active');
        }, 50);
    }
}

// Inicializar el color de la primera pestaña al cargar la página
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
        alert("Acá se reproducirá el audio cuando agregues la ruta del archivo MP3 en el HTML.");
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
