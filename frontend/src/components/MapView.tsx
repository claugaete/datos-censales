import type { Layer, MapViewState, PickingInfo } from '@deck.gl/core';
import { DeckGL } from '@deck.gl/react';
import { CompassWidget } from '@deck.gl/widgets';
import type { MjolnirPointerEvent } from 'mjolnir.js';
import Map, { StyleSpecification } from 'react-map-gl/maplibre';
import chroma, { Scale } from 'chroma-js';

import { numberToString, getBivariateColor } from '../utils/mapFormatters';
import basemapStyle from '../../data/style.json';
import { BivariateBins, BivariateDataPoint, Legend, ViewType } from '../types';

// definiciones de colores para la visualización
export const scale: Scale = chroma.scale('Viridis');
export const NAN_COLOR: [number, number, number] = [0, 0, 0];
export const BIVARIATE_COLORS: string[][] = [
    ['#e8e8e8', '#ace4e4', '#5ac8c8'],
    ['#dfb0d6', '#a5add3', '#5698b9'],
    ['#be64ac', '#8c62aa', '#3b4994'],
] as const;

// mapeo de cada tipo de vista con el texto a mostrar en la leyenda
const LEGEND_LABELS: Record<ViewType, string> = {
    conteo: 'Población filtrada (hab.)',
    densidad: 'Densidad (hab./km²)',
    porcentaje: 'Porcentaje de población total',
};

type Tooltip = {
    x: number;
    y: number;
    text: string;
};

type MapViewProps = {
    viewport: MapViewState;
    layers: Layer[];
    legend: Legend;
    bivariateData: BivariateDataPoint[];
    view: ViewType;
    scale: Scale;
    tooltip?: Tooltip;
    onViewStateChange: (viewState: MapViewState) => void;
    onHover: (info: PickingInfo, event: MjolnirPointerEvent) => void;
};

/**
 * Atribución que va en la esquina inferior derecha del mapa.
 */
const mapAttribution = (
    <div className="pointer-events-auto absolute right-2 bottom-2 z-2 gap-2 rounded-xl bg-white px-2 py-1 text-[13px] shadow-sm">
        <a href="https://maplibre.org/" target="_blank" rel="noreferrer">
            MapLibre
        </a>
        &nbsp;|&nbsp;©&nbsp;
        <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">
            CARTO
        </a>
        ,&nbsp;©&nbsp;
        <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
        >
            OpenStreetMap contributors
        </a>
    </div>
);

/**
 * Retorna una leyenda para una sola variable. Recibe el valor máximo a
 * mostrar en la leyenda, la vista que se está utilizando (para saber qué
 * descripción colocar), y la escala de colores.
 */
function UnivariateLegend({
    maxValue,
    view,
    scale,
}: {
    maxValue: number;
    view: ViewType;
    scale: Scale;
}) {
    return (
        <div
            aria-label="Leyenda univariada"
            className="pointer-events-auto absolute bottom-2 left-2 z-2 w-52 rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
        >
            <div className="mb-1 font-medium">{LEGEND_LABELS[view]}</div>
            <div
                className="h-3 rounded-sm border border-gray-300"
                style={{
                    background: `linear-gradient(to right, ${scale.colors(20).join(', ')})`,
                }}
            />
            <div className="mt-1 flex justify-between text-gray-700">
                <span>{view === 'porcentaje' ? '0%' : '0'}</span>
                <span>
                    {view === 'porcentaje'
                        ? numberToString(maxValue, '%', 100)
                        : numberToString(maxValue)}
                </span>
            </div>
        </div>
    );
}

function BivariateLegend({
    bins,
    data,
    view,
}: {
    bins: BivariateBins;
    data: BivariateDataPoint[];
    view: ViewType;
}) {
    const formatBound = (value: number) =>
        view === 'porcentaje' ? numberToString(value, '%', 100) : numberToString(value);
    const points = data.flatMap((record, index) => {
        const x = record.X?.[view];
        const y = record.Y?.[view];
        return typeof x === 'number' &&
            Number.isFinite(x) &&
            typeof y === 'number' &&
            Number.isFinite(y)
            ? [{ index, x, y }]
            : [];
    });
    const xMax = bins.X[view][2] ?? 0;
    const yMax = bins.Y[view][2] ?? 0;

    if (points.length === 0) return null;

    return (
        <div
            aria-label="Leyenda bivariada"
            className="pointer-events-auto absolute bottom-2 left-2 z-2 w-60 rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
        >
            <>
                <div className="mb-1 font-medium">Distribución de valores</div>
                <div className="flex items-start gap-0">
                    <div className="relative flex h-40 w-12 shrink-0 flex-col justify-between text-right text-gray-700">
                        <span>{formatBound(yMax)}</span>
                        <span className="absolute top-1/2 right-1/4 -translate-y-1/2 -rotate-90 font-medium">
                            Y →
                        </span>
                        <span>{formatBound(0)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div
                            className="relative h-40 border border-gray-400 bg-gray-50"
                            role="img"
                            aria-label={'Gráfico de distribución'}
                        >
                            {points.map(({ index, x, y }) => (
                                <span
                                    className="absolute h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-white/60"
                                    key={`${index}-${x}-${y}`}
                                    title={`X: ${formatBound(x)}\nY: ${formatBound(y)}`}
                                    style={{
                                        bottom: `${(y / yMax) * 100}%`,
                                        left: `${(x / xMax) * 100}%`,
                                        backgroundColor: chroma(
                                            getBivariateColor(
                                                x,
                                                y,
                                                bins.X[view],
                                                bins.Y[view],
                                                BIVARIATE_COLORS,
                                                NAN_COLOR,
                                            ),
                                        ).hex(),
                                        opacity: 0.8,
                                    }}
                                />
                            ))}
                        </div>
                        <div className="mt-1 flex justify-between text-gray-700">
                            <span>{formatBound(0)}</span>
                            <span>X →</span>
                            <span>{formatBound(xMax)}</span>
                        </div>
                    </div>
                </div>
            </>
        </div>
    );
}

export function MapView({
    viewport,
    layers,
    legend,
    bivariateData,
    view,
    scale,
    tooltip,
    onViewStateChange,
    onHover,
}: MapViewProps) {
    return (
        <div className="relative border-l border-t w-full h-full">
            <DeckGL
                controller={true}
                viewState={viewport}
                onViewStateChange={({ viewState }) => onViewStateChange(viewState)}
                layers={layers}
                onHover={onHover}
                widgets={[new CompassWidget({})]}
            >
                <Map
                    attributionControl={false}
                    mapStyle={basemapStyle as StyleSpecification}
                />
            </DeckGL>
            {tooltip && (
                <div
                    className="pointer-events-none fixed z-10 whitespace-pre rounded bg-gray-800 px-2 py-1 text-sm text-white"
                    style={{ left: tooltip.x + 8, top: tooltip.y + 8 }}
                >
                    {tooltip.text}
                </div>
            )}
            {'X' in legend ? (
                <BivariateLegend bins={legend} data={bivariateData} view={view} />
            ) : (
                legend[view] && (
                    <UnivariateLegend
                        maxValue={legend[view]}
                        view={view}
                        scale={scale}
                    />
                )
            )}
            {mapAttribution}
        </div>
    );
}
