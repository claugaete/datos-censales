import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { H3HexagonLayer, MVTLayer } from '@deck.gl/geo-layers';
import { WebMercatorViewport, LinearInterpolator, MapViewState } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import type { MjolnirPointerEvent } from 'mjolnir.js';
import '@deck.gl/widgets/stylesheet.css';
import { FlatGeobufLoader } from '@loaders.gl/flatgeobuf';

import { Form } from '../components/Form';
import { MapView } from '../components/MapView';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
setWorkerUrl(workerUrl);

const DATA_TYPES = ['manzent', 'h3'] as const;
type DataType = (typeof DATA_TYPES)[number];

type Filters = {
    var1?: string;
    cat1?: string;
    var2?: string;
    cat2?: string;
};

type DataSearchBase = {
    dataType?: DataType;
    comunaName?: string;
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
    id: string;
    [key: string]: unknown;
};
type DataRecordsArray = DataRecord[];
type DataRecordsById = Record<string, DataRecord>;
type DataRecordsWithLegend = {
    max_population: number;
    data: DataRecordsArray;
};

function isDataType(value: unknown): value is DataType {
    return (
        typeof value === 'string' && DATA_TYPES.some((dataType) => dataType === value)
    );
}

function isValidComuna(
    comunaName: unknown,
    comunasByRegion: ComunasByRegion,
): comunaName is string {
    return (
        typeof comunaName === 'string' &&
        Object.values(comunasByRegion).some((comunas) => comunas.includes(comunaName))
    );
}

function getPopulationColor(population: number | null, maxPopulation: number) {
    if (!population) return [0, 0, 0] as [number, number, number];
    const red = maxPopulation > 0 ? (population / maxPopulation) * 255 : 0;
    return [Math.max(0, Math.min(255, red)), 0, 0] as [number, number, number];
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
            var1: (search.var1 as string) || undefined,
            cat1: (search.cat1 as string) || undefined,
            var2: (search.var2 as string) || undefined,
            cat2: (search.cat2 as string) || undefined,
        };
    },
});

function HomeComponent() {
    const { dataType, comunaName, var1, cat1, var2, cat2 } = useSearch({ from: '/' });
    const filters: Filters = useMemo(
        () => ({ var1, cat1, var2, cat2 }),
        [var1, cat1, var2, cat2],
    );
    const navigate = useNavigate();

    const [variablesList, setVariablesList] = useState<VariablesList>({});
    const [comunasByRegion, setComunasByRegion] = useState<ComunasByRegion>({});
    const [region, setRegion] = useState('');
    const [dataRecordsArray, setDataRecordsArray] = useState<DataRecordsArray>([]);
    const [dataRecordsById, setDataRecordsById] = useState<DataRecordsById>({});
    const [dataAvailable, setDataAvailable] = useState(false);
    const [selectedComuna, setSelectedComuna] = useState<string>(comunaName ?? '');
    const [selectedDataType, setSelectedDataType] = useState(dataType ?? 'manzent');
    const [selectedFilters, setSelectedFilters] = useState(getFormFilters(filters));
    const [maxPopulation, setMaxPopulation] = useState(0);
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

    const populationKey = `${dataType}:${comunaName}`;
    const populationKeyRef = useRef(populationKey);
    populationKeyRef.current = populationKey;

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
        setSelectedDataType(dataType ?? 'manzent');
        setMaxPopulation(0);
        setDataAvailable(false);

        const matchingRegion = Object.entries(comunasByRegion).find(([, comunas]) =>
            comunas.includes(validComunaName),
        );

        setRegion(matchingRegion?.[0] ?? '');

        if (Object.values(filters).every((value) => value)) {
            const urlFilters = new URLSearchParams({ ...filters });
            fetch(
                `/api/comuna/${validComunaName}/${dataType ?? 'manzent'}-data/?${urlFilters.toString()}`,
            )
                .then((response) => {
                    if (!response.ok) return;
                    return response.json();
                })
                .then((dataWithLegend: DataRecordsWithLegend) => {
                    if (!dataWithLegend) return;
                    const { max_population, data } = dataWithLegend;

                    setMaxPopulation(max_population);
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
                zoomToComuna(bbox);
            });
    }, [validComunaName, dataType]);

    useEffect(() => {
        if (Object.keys(comunasByRegion).length === 0) return;

        if (!validComunaName) {
            navigate({
                to: '/',
                replace: true,
                search: {
                    dataType,
                    comunaName: undefined,
                    ...filters,
                },
            });
        }
    }, [validComunaName, dataType, comunasByRegion, navigate, filters]);

    const handleSubmit = ({ comunaName, dataType, ...filters }: DataSearch) => {
        console.log(comunaName, dataType, filters);
        navigate({
            to: '/',
            search: {
                comunaName,
                dataType: isDataType(dataType) ? dataType : 'manzent',
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
                    dataType: dataType ?? 'manzent',
                    ...filters,
                });
            }
        },
        [comunaName, dataType, filters],
    );

    function getManzentPopulation(id: string) {
        const record = dataRecordsById[id];
        if (!record) return null;
        return typeof record.conteo === 'number' ? record.conteo : null;
    }

    function getTooltipData(id: string) {
        const record = dataRecordsById[id];
        if (!record) return null;
        return (
            `ID: ${record.MANZENT ?? record.hex_id}\n`
            + `Población total: ${Math.round(record.poblacion as number).toLocaleString('es-CL')} hab.\n`
            + `Población filtrada: ${Math.round(record.conteo as number).toLocaleString('es-CL')} hab.`
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
                    id: `comuna-${populationKey}`,
                    data: dataRecordsArray,
                    getHexagon: (d) => d.hex_id,
                    extruded: false,
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 2,
                    opacity: 0.4,
                    getLineColor: [60, 60, 60],
                    getFillColor: (d) => getPopulationColor(d.conteo, maxPopulation),
                    updateTriggers: {
                        getFillColor: [maxPopulation],
                    },
                    pickable: true,
                })
              : new GeoJsonLayer({
                    id: `comuna-${populationKey}`,
                    data: `/api/comuna/${comunaName}/manzent-geom/`,
                    loaders: [FlatGeobufLoader],
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 2,
                    opacity: 0.4,
                    getLineColor: [60, 60, 60],
                    getFillColor: (d) =>
                        getPopulationColor(
                            getManzentPopulation(d.properties.MANZENT),
                            maxPopulation,
                        ),
                    updateTriggers: {
                        getFillColor: [maxPopulation],
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
            <aside className="flex w-80 min-w-80 shrink-0 flex-col border-r border-slate-200 bg-white p-5 shadow-sm">
                <Form
                    comunasByRegion={comunasByRegion}
                    variablesList={variablesList}
                    region={region}
                    selectedComuna={selectedComuna}
                    selectedDataType={selectedDataType}
                    selectedVariable1={selectedFilters.var1}
                    selectedCategory1={selectedFilters.cat1}
                    selectedVariable2={selectedFilters.var2}
                    selectedCategory2={selectedFilters.cat2}
                    onRegionChange={setRegion}
                    onComunaChange={setSelectedComuna}
                    onDataTypeChange={(newType) =>
                        setSelectedDataType(isDataType(newType) ? newType : 'manzent')
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
                maxPopulation={maxPopulation}
                tooltip={tooltip}
                onViewStateChange={setViewport}
                onHover={onHover}
            />
        </div>
    );
}
