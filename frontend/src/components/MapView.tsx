import type { Layer, MapViewState, PickingInfo } from '@deck.gl/core';
import { DeckGL } from '@deck.gl/react';
import { CompassWidget } from '@deck.gl/widgets';
import type { MjolnirPointerEvent } from 'mjolnir.js';
import Map, { StyleSpecification } from 'react-map-gl/maplibre';
import { Scale } from 'chroma-js';

import basemapStyle from '../../data/style.json';
import { MaxValues, ViewType } from '../types';

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
    maxValues: MaxValues;
    view: ViewType;
    scale: Scale;
    tooltip?: Tooltip;
    onViewStateChange: (viewState: MapViewState) => void;
    onHover: (info: PickingInfo, event: MjolnirPointerEvent) => void;
};

export function numberToString(n: unknown, suffix: string = '', factor: number = 1) {
    if (typeof n !== 'number') return 'N/A';
    const nScaled = (n as number) * factor;
    if (Number.isInteger(nScaled)) return nScaled.toLocaleString('es-CL') + suffix;
    return Number(nScaled.toFixed(2)).toLocaleString('es-CL') + suffix;
}

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
                <span>0</span>
                <span>{numberToString(maxValue)}</span>
            </div>
        </div>
    );
}

export function MapView({
    viewport,
    layers,
    maxValues,
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
            {maxValues[view] && (
                <UnivariateLegend maxValue={maxValues[view]} view={view} scale={scale} />
            )}
            {mapAttribution}
        </div>
    );
}
