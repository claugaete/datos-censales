import type { Layer, MapViewState, PickingInfo } from '@deck.gl/core';
import { DeckGL } from '@deck.gl/react';
import { CompassWidget } from '@deck.gl/widgets';
import type { MjolnirPointerEvent } from 'mjolnir.js';
import { useState } from 'react';
import Map, { StyleSpecification } from 'react-map-gl/maplibre';
import chroma, { Scale } from 'chroma-js';

import basemapStyle from '../../data/style.json';
import { BivariateBins, Legend, ViewType } from '../types';

// definiciones de colores para la visualización
export const scale: Scale = chroma.scale('Viridis');
export const NAN_COLOR: [number, number, number] = [0, 0, 0];
export const BIVARIATE_COLORS = [
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
    view: ViewType;
    scale: Scale;
    tooltip?: Tooltip;
    onViewStateChange: (viewState: MapViewState) => void;
    onHover: (info: PickingInfo, event: MjolnirPointerEvent) => void;
};

/**
 * Convierte un número en una string, según la siguiente lógica:
 *
 * - Si no es un número, retorna N/A.
 * - Si es un número:
 *   - Lo multiplica por `factor`.
 *   - Si es entero, lo muestra sin decimales.
 *   - Si no es entero, lo muestra con dos decimales.
 *   - Le agrega el sufijo `suffix` (notar que este sufijo no se agrega si el
 *     número es N/A).
 *
 * @param n El número a mostrar.
 * @param suffix El sufijo a agregar (si el número existe).
 * @param factor El factor por el cual multiplicar el número.
 * @returns String con el nuevo número (de existir) y su sufijo.
 */
export function numberToString(n: unknown, suffix: string = '', factor: number = 1) {
    if (typeof n !== 'number') return 'N/A';
    const nScaled = (n as number) * factor;
    if (Number.isInteger(nScaled)) return nScaled.toLocaleString('es-CL') + suffix;
    return Number(nScaled.toFixed(2)).toLocaleString('es-CL') + suffix;
}

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
            aria-label="Leyenda de población"
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

function BivariateLegend({ bins, view }: { bins: BivariateBins; view: ViewType }) {
    const [hoveredRange, setHoveredRange] = useState<string>();
    const formatBound = (value: number) =>
        view === 'porcentaje' ? numberToString(value, '%', 100) : numberToString(value);
    const xBounds = bins.X[view];
    const yBounds = bins.Y[view];
    const hasBins = [...xBounds, ...yBounds].some((bound) => bound > 0);
    const range = (bounds: [number, number, number], index: number) => {
        const lowerBound = index === 0 ? 0 : bounds[index - 1];
        return `${formatBound(lowerBound)} - ${formatBound(bounds[index])}`;
    };

    return (
        <div
            aria-label="Leyenda bivariada"
            className="pointer-events-auto absolute bottom-2 left-2 z-2 rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
        >
            {hasBins && (
                <div className="flex items-start gap-2">
                    <div>
                        <div className="relative h-36 w-36 border border-gray-400">
                            <div className="grid h-full w-full grid-cols-3 grid-rows-3">
                                {[...BIVARIATE_COLORS]
                                    .reverse()
                                    .flatMap((row, rowIndex) =>
                                        row.map((color, columnIndex) => (
                                            <div
                                                aria-label={`X: ${range(xBounds, columnIndex)}, Y: ${range(yBounds, 2 - rowIndex)}`}
                                                className="border border-white"
                                                key={`${rowIndex}-${columnIndex}`}
                                                style={{ backgroundColor: color }}
                                                onMouseEnter={() =>
                                                    setHoveredRange(
                                                        `X: ${range(xBounds, columnIndex)}\nY: ${range(yBounds, 2 - rowIndex)}`,
                                                    )
                                                }
                                                onMouseLeave={() =>
                                                    setHoveredRange(undefined)
                                                }
                                            />
                                        )),
                                    )}
                            </div>
                            {hoveredRange && (
                                <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-pre rounded bg-gray-800 px-2 py-1 text-xs text-white shadow">
                                    {hoveredRange}
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-center font-medium">X →</div>
                    </div>
                    <div className="relative h-36 w-4 font-medium">
                        <span
                            className="absolute left-1/2 top-1/2 whitespace-nowrap"
                            style={{
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            ↑<br />Y
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

export function MapView({
    viewport,
    layers,
    legend,
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
            {'X' in legend
                ? legend.X[view] && <BivariateLegend bins={legend} view={view} />
                : legend[view] && (
                      <UnivariateLegend
                          maxValue={legend[view]}
                          view={view}
                          scale={scale}
                      />
                  )}
            {mapAttribution}
        </div>
    );
}
