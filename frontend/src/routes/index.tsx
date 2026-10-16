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

const scale: Scale = chroma.scale('Viridis');
const NAN_COLOR: [number, number, number] = [0, 0, 0];

type Filters = {
    var1?: string;
    cat1?: string;
    var2?: string;
    cat2?: string;
};

type DataSearchBase = {
    dataType?: DataType;
    comunaName?: string;
    view?: ViewType;
};

type DataSearch = DataSearchBase & Filters;

type ComunasByRegion = Record<string, string[]>;
type VariablesList = Record<string, string[]>;

type Bbox = {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
};

type DataRecord = {
    [key: string]: unknown;
};
type DataRecordsArray = DataRecord[];
type DataRecordsById = Record<string, DataRecord>;
type DataRecordsWithLegend = {
    maxValues: MaxValues;
    data: DataRecordsArray;
};

function isValidComuna(
    comunaName: unknown,
    comunasByRegion: ComunasByRegion,
): comunaName is string {
    return (
        typeof comunaName === 'string' &&
        Object.values(comunasByRegion).some((comunas) => comunas.includes(comunaName))
    );
}

function getColor(value: number | null, maxValue: number) {
    if (typeof value !== 'number') return NAN_COLOR;
    const fraction = maxValue > 0 ? value / maxValue : 0;
    return scale(fraction).rgb() as [number, number, number];
}

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
    const [region, setRegion] = useState('');
    const [dataRecordsArray, setDataRecordsArray] = useState<DataRecordsArray>([]);
    const [dataRecordsById, setDataRecordsById] = useState<DataRecordsById>({});
    const [dataAvailable, setDataAvailable] = useState(false);
    const [selectedComuna, setSelectedComuna] = useState<string>(comunaName ?? '');
    const [selectedDataType, setSelectedDataType] = useState(dataType);
    const [selectedView, setSelectedView] = useState(view);
    const [selectedFilters, setSelectedFilters] = useState(getFormFilters(filters));
    const [maxValues, setMaxValues] = useState(MAX_VALUES_DEFAULT);
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

    const comunaNameRef = useRef(comunaName);
    comunaNameRef.current = comunaName;

    const validComunaName = useMemo(() => {
        if (Object.keys(comunasByRegion).length === 0) return undefined;

        return isValidComuna(comunaName, comunasByRegion) ? comunaName : undefined;
    }, [comunaName, comunasByRegion]);

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

    useEffect(() => {
        if (!validComunaName) {
            setSelectedComuna('');
            setRegion('');
            setDataRecordsArray([]);
            setDataRecordsById({});
            setDataAvailable(false);
            return;
        }

        setSelectedComuna(validComunaName);
        setSelectedDataType(dataType);
        setSelectedView(view);
        setMaxValues(MAX_VALUES_DEFAULT);
        setDataAvailable(false);

        const matchingRegion = Object.entries(comunasByRegion).find(([, comunas]) =>
            comunas.includes(validComunaName),
        );

        setRegion(matchingRegion?.[0] ?? '');

        if (Object.values(filters).every((value) => value)) {
            const urlFilters = new URLSearchParams({ ...filters });
            fetch(
                `/api/comuna/${validComunaName}/${dataType}-data/?${urlFilters.toString()}`,
            )
                .then((response) => {
                    if (!response.ok) return;
                    return response.json();
                })
                .then((dataWithLegend: DataRecordsWithLegend) => {
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

    useEffect(() => {
        if (!validComunaName) return;

        fetch(`/api/comuna/${validComunaName}/bbox/`)
            .then((response) => response.json())
            .then((bbox: Bbox) => {
                if (comunaNameRef.current !== comunaName) return;
                zoomToComuna(bbox);
            });
    }, [validComunaName]);

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

    const handleSubmit = ({ comunaName, dataType, view, ...filters }: DataSearch) => {
        navigate({
            to: '/',
            search: {
                comunaName,
                dataType: isDataType(dataType) ? dataType : 'manzent',
                view: isView(view) ? view : 'conteo',
                ...filters,
            },
        });
    };

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

    function getManzentValue(id: string) {
        const record = dataRecordsById[id];
        if (!record) return null;
        return typeof record[view] === 'number' ? record[view] : null;
    }

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
                    region={region}
                    selectedComuna={selectedComuna}
                    selectedDataType={selectedDataType}
                    selectedView={selectedView}
                    selectedVariable1={selectedFilters.var1}
                    selectedCategory1={selectedFilters.cat1}
                    selectedVariable2={selectedFilters.var2}
                    selectedCategory2={selectedFilters.cat2}
                    onRegionChange={setRegion}
                    onComunaChange={setSelectedComuna}
                    onDataTypeChange={(newType) =>
                        setSelectedDataType(isDataType(newType) ? newType : 'manzent')
                    }
                    onViewChange={(newView) =>
                        setSelectedView(isView(newView) ? newView : 'conteo')
                    }
                    onVariable1Change={(variable) => {
                        if (variable === selectedFilters.var2) {
                            setSelectedFilters({
                                ...selectedFilters,
                                var2: '',
                                cat2: '',
                            });
                        } else {
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
