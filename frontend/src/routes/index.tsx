import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import chroma, { Scale } from 'chroma-js';
import { GeoJsonLayer } from '@deck.gl/layers';
import { H3HexagonLayer, MVTLayer } from '@deck.gl/geo-layers';
import { WebMercatorViewport, LinearInterpolator, MapViewState } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import type { MjolnirPointerEvent } from 'mjolnir.js';
import '@deck.gl/widgets/stylesheet.css';
import { FlatGeobufLoader } from '@loaders.gl/flatgeobuf';

import { Form } from '../components/Form';
import { MapView, numberToString } from '../components/MapView';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
    DataType,
    MAX_VALUES_DEFAULT,
    MaxValues,
    ViewType,
    isDataType,
    isView,
} from '../types';
setWorkerUrl(workerUrl);

// definiciones de colores para la visualización
const scale: Scale = chroma.scale('Viridis');
const NAN_COLOR: [number, number, number] = [0, 0, 0];

/**
 * Filtros para los datos recibidos.
 */
type Filters = {
    var1?: string;
    cat1?: string;
    var2?: string;
    cat2?: string;
};

/**
 * Campos base para una consulta a la aplicación.
 */
type DataSearchBase = {
    dataType?: DataType;
    comunaName?: string;
    view?: ViewType;
};

/**
 * Todos los campos de una consulta a la aplicación (campos base + filtros).
 */
type DataSearch = DataSearchBase & Filters;

/**
 * Asocia a cada región con sus comunas.
 */
type ComunasByRegion = Record<string, string[]>;

/**
 * Asocia a cada variable con sus categorías (valores posibles).
 */
type VariablesList = Record<string, string[]>;

/**
 * Bounding box de un polígono.
 */
type Bbox = {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
};

/**
 *  Datos asociados a cada manzana/entidad/celda.
 */
type DataRecord = {
    MANZENT?: string;
    hex_id?: string;
    poblacion: number;
    area: number;
    conteo: number;
    densidad: number;
    porcentaje: number | null;
};
/**
 * Arreglo de datos, conteniendo la información de una comuna.
 */
type DataRecordsArray = DataRecord[];

/**
 * Mapeo que asocia cada ID (`MANZENT`/`hex_id`) con su DataRecord
 * correspondiente.
 */
type DataRecordsById = Record<string, DataRecord>;

/**
 * Información recibida al solicitar los datos de una comuna. Contiene el
 * arreglo correspondiente, junto con los valores máximos para cada una de las
 * tres columnas a visualizar.
 */
type DataRecordsWithLegend = {
    maxValues: MaxValues;
    data: DataRecordsArray;
};

/**
 * Revisa si el nombre de una comuna es válido (pertenece a alguna región).
 *
 * @param comunaName Nombre de la comuna.
 * @param comunasByRegion Mapeo de cada región a sus comunas.
 * @returns Si la comuna es válida o no.
 */
function isValidComuna(
    comunaName: unknown,
    comunasByRegion: ComunasByRegion,
): comunaName is string {
    return (
        typeof comunaName === 'string' &&
        Object.values(comunasByRegion).some((comunas) => comunas.includes(comunaName))
    );
}

/**
 * Obtiene el color asociado a un cierto valor.
 *
 * @param value El valor de la celda.
 * @param maxValue El valor máximo entre las celdas (asociado al color máximo
 * de la escala).
 * @returns Color asociado al valor, en formato RGB.
 */
function getColor(value: number | null, maxValue: number) {
    if (typeof value !== 'number') return NAN_COLOR;
    const fraction = maxValue > 0 ? value / maxValue : 0;
    return scale(fraction).rgb() as [number, number, number];
}

/**
 * Destructura un objeto `filters`, reemplazando los valores indefinidos por
 * strings vacías.
 * @param filters El objeto a destructurar.
 * @returns Las variables y categorías nuevas.
 */
function getFormFilters(filters: Filters) {
    return {
        var1: filters.var1 ?? '',
        cat1: filters.cat1 ?? '',
        var2: filters.var2 ?? '',
        cat2: filters.cat2 ?? '',
    };
}

export const Route = createFileRoute('/')({
    component: HomeComponent,
    validateSearch: (search: Record<string, unknown>): DataSearch => {
        return {
            dataType: isDataType(search.dataType) ? search.dataType : undefined,
            comunaName: (search.comunaName as string) || undefined,
            view: isView(search.view) ? search.view : undefined,
            var1: (search.var1 as string) || undefined,
            cat1: (search.cat1 as string) || undefined,
            var2: (search.var2 as string) || undefined,
            cat2: (search.cat2 as string) || undefined,
        };
    },
});

function HomeComponent() {
    const {
        dataType: dataTypeParam,
        comunaName,
        view: viewParam,
        var1,
        cat1,
        var2,
        cat2,
    } = useSearch({ from: '/' });
    const filters: Filters = useMemo(
        () => ({ var1, cat1, var2, cat2 }),
        [var1, cat1, var2, cat2],
    );
    const dataType = dataTypeParam ?? 'manzent';
    const view = viewParam ?? 'conteo';
    const navigate = useNavigate();

    const [variablesList, setVariablesList] = useState<VariablesList>({});
    const [comunasByRegion, setComunasByRegion] = useState<ComunasByRegion>({});
    const [dataRecordsArray, setDataRecordsArray] = useState<DataRecordsArray>([]);
    const [dataRecordsById, setDataRecordsById] = useState<DataRecordsById>({});
    const [dataAvailable, setDataAvailable] = useState(false);

    const [maxValues, setMaxValues] = useState(MAX_VALUES_DEFAULT);

    // campos del formulario
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedComuna, setSelectedComuna] = useState<string>(comunaName ?? '');
    const [selectedDataType, setSelectedDataType] = useState(dataType);
    const [selectedView, setSelectedView] = useState(view);
    const [selectedFilters, setSelectedFilters] = useState(getFormFilters(filters));

    const [viewport, setViewport] = useState<MapViewState>({
        latitude: -40,
        longitude: -70,
        zoom: 3.5,
        bearing: 0,
        pitch: 0,
    });
    const [tooltip, setTooltip] = useState<
        { x: number; y: number; text: string } | undefined
    >();

    // referencia a la comuna actual (sirve para determinar un stale request
    // cuando uno clickea una comuna mientras todavía se está generando el
    // request de una comuna anterior)
    const comunaNameRef = useRef(comunaName);
    comunaNameRef.current = comunaName;

    // reemplaza el nombre de la comuna por undefined si en verdad no existe
    const validComunaName = useMemo(() => {
        if (Object.keys(comunasByRegion).length === 0) return undefined;

        return isValidComuna(comunaName, comunasByRegion) ? comunaName : undefined;
    }, [comunaName, comunasByRegion]);

    // obtenemos los mapeos
    useEffect(() => {
        fetch('/api/list/variables/')
            .then((response) => response.json())
            .then((data: VariablesList) => setVariablesList(data));
    }, []);

    useEffect(() => {
        fetch('/api/list/comunas/')
            .then((response) => response.json())
            .then((data: ComunasByRegion) => setComunasByRegion(data));
    }, []);

    // effect que realiza la carga de datos al clickear una comuna o cambiar
    // filtros
    useEffect(() => {
        // si la comuna no es válida, no cargamos datos
        if (!validComunaName) {
            setSelectedComuna('');
            setSelectedRegion('');
            setDataRecordsArray([]);
            setDataRecordsById({});
            setDataAvailable(false);
            return;
        }

        // actualizamos los campos del form
        setSelectedComuna(validComunaName);
        setSelectedDataType(dataType);
        setSelectedView(view);
        const matchingRegion = Object.entries(comunasByRegion).find(([, comunas]) =>
            comunas.includes(validComunaName),
        );
        setSelectedRegion(matchingRegion?.[0] ?? '');

        setMaxValues(MAX_VALUES_DEFAULT);
        setDataAvailable(false);

        // obtenemos los datos solicitados (solamente si se tienen todos los
        // filtros necesarios)
        if (Object.values(filters).every((value) => value)) {
            const urlFilters = new URLSearchParams({ ...filters });
            fetch(
                `/api/comuna/${validComunaName}/${dataType}-data/?${urlFilters.toString()}`,
            )
                .then((response) => {
                    // si la response falla, no generamos datos
                    // TODO: agregar un toast explicando qué falló
                    if (!response.ok) return;
                    return response.json();
                })
                .then((dataWithLegend: DataRecordsWithLegend) => {
                    // si la request es stale, retornamos
                    if (!dataWithLegend || comunaNameRef.current !== comunaName) {
                        return;
                    }
                    const { maxValues, data } = dataWithLegend;

                    setMaxValues(maxValues);
                    setDataRecordsById(
                        Object.fromEntries(data.map((r) => [r.MANZENT ?? r.hex_id, r])),
                    );
                    setDataRecordsArray(data);
                    setDataAvailable(true);
                });
        }
    }, [validComunaName, dataType, filters]);

    /**
     * Realiza un zoom a la bounding box solicitada.
     * 
     * @param bbox Bounding box a la cual hacer zoom.
     * @param transitionDuration Duración de la transición (por defecto, 1.5
     * segundos).
     */
    function zoomToComuna(bbox: Bbox, transitionDuration: number = 1500) {
        const viewportWebMercator = new WebMercatorViewport({
            ...viewport,
            width: window.innerWidth,
            height: window.innerHeight,
        });
        const { longitude, latitude, zoom } = viewportWebMercator.fitBounds([
            [bbox.minx, bbox.miny],
            [bbox.maxx, bbox.maxy],
        ]);
        const newViewport: MapViewState = {
            ...viewport,
            longitude,
            latitude,
            zoom: zoom - 0.5,
            transitionInterpolator: new LinearInterpolator(),
            transitionDuration,
        };
        setViewport(newViewport);
    }

    // hacemos zoom a la comuna solicitada, solo si esta cambia (si cambian
    // los filtros o la vista, dejamos el viewport igual)
    useEffect(() => {
        if (!validComunaName) return;

        fetch(`/api/comuna/${validComunaName}/bbox/`)
            .then((response) => response.json())
            .then((bbox: Bbox) => {
                if (comunaNameRef.current !== comunaName) return;
                zoomToComuna(bbox);
            });
    }, [validComunaName]);

    // si el nombre de la comuna no es válido, redirigimos a la página sin
    // ninguna comuna seleccionada
    useEffect(() => {
        if (Object.keys(comunasByRegion).length === 0) return;

        if (!validComunaName) {
            navigate({
                to: '/',
                replace: true,
                search: {
                    comunaName: undefined,
                    dataType,
                    view,
                    ...filters,
                },
            });
        }
    }, [validComunaName, comunasByRegion, navigate]);

    /**
     * Navega a la página con los parámetros solicitados, reemplazando
     * `dataType` y `view` con valores por defecto si los valores recibidos no
     * son válidos.
     */
    const handleSubmit = ({ comunaName, dataType, view, ...filters }: DataSearch) => {
        navigate({
            to: '/',
            replace: true,
            search: {
                comunaName,
                dataType: isDataType(dataType) ? dataType : 'manzent',
                view: isView(view) ? view : 'conteo',
                ...filters,
            },
        });
    };

    /**
     * Envía el formulario con los parámetros seleccionados.
     */
    const handleFormSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (
            selectedComuna &&
            Object.values(selectedFilters).every((value) => value !== '')
        ) {
            handleSubmit({
                comunaName: selectedComuna,
                dataType: selectedDataType,
                view: selectedView,
                ...selectedFilters,
            });
        }
    };
    
    // al clickear una comuna, consultamos por ella, manteniendo los demás
    // parámetros (tipo de dato, vista, filtros) iguales
    const onClickGeoJson = useCallback(
        ({ object }: PickingInfo) => {
            if (object) {
                const newComuna = object.properties.COMUNA;
                if (comunaName === newComuna) return;
                handleSubmit({
                    comunaName: newComuna,
                    dataType: dataType,
                    view: view,
                    ...filters,
                });
            }
        },
        [comunaName, dataType, view, filters],
    );

    /**
     * Retorna el dato asociado a la vista actual, para una manzana/entidad.
     * @param id ID de la manzana/entidad.
     * @returns El dato asociado a la vista actual; nulo si no existe.
     */
    function getManzentValue(id: string) {
        const record = dataRecordsById[id];
        if (!record) return null;
        return typeof record[view] === 'number' ? record[view] : null;
    }

    /**
     * Retorna el texto del tooltip para una manzana/entidad/celda.
     * @param id ID de la manzana/entidad/celda.
     * @returns Texto plano con todos los datos asociados; nulo si no existen
     * datos asociado a la ID.
     */
    function getTooltipData(id: string) {
        const record = dataRecordsById[id];
        if (!record) return null;
        return (
            `ID: ${record.MANZENT ?? record.hex_id}\n` +
            `Población total: ${numberToString(record.poblacion, ' hab.')}\n` +
            `Área: ${numberToString(record.area, ' m²', 1_000_000)}\n` +
            `Población filtrada: ${numberToString(record.conteo, ' hab.')}\n` +
            `Densidad: ${numberToString(record.densidad, ' hab./km²')}\n` +
            `Porcentaje del total: ${numberToString(record.porcentaje, '%', 100)}`
        );
    }

    // obtenemos el tooltip para una manzana/entidad/celda según su ID; si es
    // una comuna, simplemente mostramos su nombre
    const getTooltip = useCallback(
        ({ object }: PickingInfo) => {
            if (!object) return null;
            if (object.hex_id) {
                return getTooltipData(object.hex_id);
            } else if (object.properties.MANZENT) {
                return getTooltipData(object.properties.MANZENT);
            } else {
                return `${object.properties.COMUNA}`;
            }
        },
        [dataRecordsById],
    );

    const onHover = useCallback(
        (info: PickingInfo, event: MjolnirPointerEvent) => {
            const text = getTooltip(info);
            if (!text) {
                setTooltip(undefined);
                return;
            }
            setTooltip({
                x: event.srcEvent.clientX,
                y: event.srcEvent.clientY,
                text,
            });
        },
        [getTooltip],
    );

    // capa que contiene los datos a mostrar, pueden ser celdas de H3
    // (cargadas con H3HexagonLayer directamente desde `dataRecordsArray`) o
    // manzanas/entidades (se cargan las geometrías por separado)
    const dataLayer =
        !comunaName || !dataAvailable
            ? new GeoJsonLayer({ id: 'empty-layer', data: [] })
            : dataType === 'h3'
              ? new H3HexagonLayer({
                    id: `h3-${comunaName}`,
                    data: dataRecordsArray,
                    getHexagon: (d) => d.hex_id,
                    extruded: false,
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 0,
                    opacity: 0.4,
                    getLineColor: [60, 60, 60],
                    getFillColor: (d) => getColor(d[view], maxValues[view]),
                    updateTriggers: {
                        getFillColor: [maxValues, view],
                    },
                    pickable: true,
                })
              : new GeoJsonLayer({
                    id: `manzent-${comunaName}`,
                    data: `/api/comuna/${comunaName}/manzent-geom/`,
                    loaders: [FlatGeobufLoader],
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 0,
                    opacity: 0.4,
                    getLineColor: [60, 60, 60],
                    getFillColor: (d) =>
                        getColor(
                            getManzentValue(d.properties.MANZENT),
                            maxValues[view],
                        ),
                    updateTriggers: {
                        getFillColor: [maxValues, view],
                    },
                    pickable: true,
                });

    // capas a mostrar (comunas para clickear + capa de datos)
    const layers = [
        new MVTLayer({
            id: 'comunas',
            data: '/api/tiles/{z}/{x}/{y}/',
            stroked: true,
            filled: true,
            lineWidthMinPixels: 2,
            getLineColor: [60, 60, 60],
            getLineWidth: 1,
            getFillColor: (d) => [
                60,
                60,
                60,
                !comunaName || d.properties.COMUNA !== comunaName ? 0.4 * 255 : 0,
            ],
            maxZoom: 12,
            updateTriggers: {
                getFillColor: [comunaName],
            },
            pickable: true,
            onClick: onClickGeoJson,
            autoHighlight: true,
        }),
        dataLayer,
    ];

    return (
        <div className="flex w-full h-full">
            <aside className="flex h-full min-h-0 w-80 min-w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-5 shadow-sm">
                <Form
                    comunasByRegion={comunasByRegion}
                    variablesList={variablesList}
                    selectedRegion={selectedRegion}
                    selectedComuna={selectedComuna}
                    selectedDataType={selectedDataType}
                    selectedView={selectedView}
                    selectedVariable1={selectedFilters.var1}
                    selectedCategory1={selectedFilters.cat1}
                    selectedVariable2={selectedFilters.var2}
                    selectedCategory2={selectedFilters.cat2}
                    onRegionChange={setSelectedRegion}
                    onComunaChange={setSelectedComuna}
                    onDataTypeChange={(newType) =>
                        setSelectedDataType(isDataType(newType) ? newType : 'manzent')
                    }
                    onViewChange={(newView) =>
                        setSelectedView(isView(newView) ? newView : 'conteo')
                    }
                    onVariable1Change={(variable) => {
                        // si var1 pasa a ser igual a var2, borramos var2 (pno
                        // tiene sentido consultar por la misma variable dos
                        // veces)
                        if (variable === selectedFilters.var2) {
                            setSelectedFilters({
                                ...selectedFilters,
                                var2: '',
                                cat2: '',
                            });
                        } else {
                            // si cambia la variable, se borra la categoría
                            // anteriormente seleccionada para esa variable
                            setSelectedFilters({
                                ...selectedFilters,
                                var1: variable,
                                cat1: '',
                            });
                        }
                    }}
                    onCategory1Change={(category) =>
                        setSelectedFilters({
                            ...selectedFilters,
                            cat1: category,
                        })
                    }
                    onVariable2Change={(variable) =>
                        setSelectedFilters({
                            ...selectedFilters,
                            var2: variable,
                            cat2: '',
                        })
                    }
                    onCategory2Change={(category) =>
                        setSelectedFilters({
                            ...selectedFilters,
                            cat2: category,
                        })
                    }
                    onSubmit={handleFormSubmit}
                />
            </aside>
            <MapView
                viewport={viewport}
                layers={layers}
                maxValues={maxValues}
                view={view}
                scale={scale}
                tooltip={tooltip}
                onViewStateChange={setViewport}
                onHover={onHover}
            />
        </div>
    );
}
