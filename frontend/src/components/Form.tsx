import type { SubmitEventHandler } from 'react';
import { DataType, ViewType, Filter } from '../types';

// mapeo de cada tipo de dato con el texto a mostrar en el formulario
const DATA_TYPE_OPTIONS: Record<DataType, string> = {
    manzent: 'Manzanas/entidades por comuna',
    h3_comuna: 'Celdas H3 por comuna (área urbana)',
    h3_conurbacion: 'Celdas H3 por conurbación',
};

// mapeo de cada vista con el texto a mostrar en el formulario
const VIEW_OPTIONS: Record<ViewType, string> = {
    conteo: 'Conteo',
    densidad: 'Densidad',
    porcentaje: 'Porcentaje',
};

type FormProps = {
    placesByRegion: Record<string, string[]>;
    variablesList: Record<string, string[]>;
    maxFilters: number;
    selectedRegion: string;
    selectedPlace: string;
    selectedDataType: string;
    selectedView: string;
    selectedFilters: Filter[];
    onRegionChange: (region: string) => void;
    onPlaceChange: (comuna: string) => void;
    onDataTypeChange: (newType: string) => void;
    onViewChange: (newView: string) => void;
    onFilterChange: (index: number, field: keyof Filter, value?: string) => void;
    onSubmit: SubmitEventHandler<HTMLFormElement>;
};

export function Form({
    placesByRegion,
    variablesList,
    maxFilters,
    selectedRegion,
    selectedPlace,
    selectedDataType,
    selectedView,
    selectedFilters,
    onRegionChange,
    onPlaceChange,
    onDataTypeChange,
    onViewChange,
    onFilterChange,
    onSubmit,
}: FormProps) {
    const variableNames = Object.keys(variablesList);

    return (
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <button
                className="mt-2 rounded-md border border-black bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-slate-800 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
                type="submit"
            >
                Mostrar en el mapa
            </button>

            <label
                className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                htmlFor="dataType"
            >
                Capa
                <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    id="dataType"
                    value={selectedDataType}
                    onChange={(event) => onDataTypeChange(event.target.value)}
                >
                    {Object.entries(DATA_TYPE_OPTIONS).map(([key, value]) => (
                        <option key={key} value={key}>{value}</option>
                    ))}
                </select>
            </label>

            <label
                className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                htmlFor="region"
            >
                Región
                <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    id="region"
                    value={selectedRegion}
                    onChange={(event) => {
                        onRegionChange(event.target.value);
                        onPlaceChange('');
                    }}
                    required
                >
                    <option value="">Selecciona una región</option>
                    {Object.keys(placesByRegion).map((regionName) => (
                        <option key={regionName} value={regionName}>
                            {regionName}
                        </option>
                    ))}
                </select>
            </label>

            <label
                className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                htmlFor="place"
            >
                {selectedDataType === 'h3_conurbacion' ? 'Conurbación' : 'Comuna'}
                <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    id="place"
                    value={selectedPlace}
                    onChange={(event) => onPlaceChange(event.target.value)}
                    disabled={!selectedRegion}
                    required
                >
                    <option value="">Selecciona un lugar</option>
                    {(placesByRegion[selectedRegion] ?? []).map((placeName) => (
                        <option key={placeName} value={placeName}>
                            {placeName}
                        </option>
                    ))}
                </select>
            </label>

            <label
                className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                htmlFor="viewType"
            >
                Vista
                <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    id="dataType"
                    value={selectedView}
                    onChange={(event) => onViewChange(event.target.value)}
                >
                    {Object.entries(VIEW_OPTIONS).map(([key, value]) => (
                        <option key={key} value={key}>{value}</option>
                    ))}
                </select>
            </label>

            <span className="text-sm font-medium text-slate-700">Filtros</span>
            <fieldset className="flex flex-col gap-3 rounded-md border border-slate-300 p-3">
                {Array.from({ length: maxFilters }, (_, index) => {
                    const filter = selectedFilters[index] ?? { variable: '', catX: '' };

                    return (
                        <div
                            className="flex flex-col gap-3 rounded-md border border-slate-200 p-3"
                            key={index}
                        >
                            <div className="rounded-md p-2">
                                <label
                                    className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                                    htmlFor={`variable${index}`}
                                >
                                    Variable {index + 1}
                                    <select
                                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                                        id={`variable${index}`}
                                        value={filter.variable}
                                        onChange={(event) =>
                                            onFilterChange(index, 'variable', event.target.value)
                                        }
                                        required
                                    >
                                        <option value="">Selecciona una variable</option>
                                        {variableNames
                                            .map((variable) => (
                                                <option key={variable} value={variable}>
                                                    {variable}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                            </div>

                            <div className="rounded-md p-2">
                                <label
                                    className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                                    htmlFor={`categoryX${index}`}
                                >
                                    {filter.catY === undefined
                                        ? 'Categoría'
                                        : 'Categoría X'}
                                    <select
                                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                        id={`categoryX${index}`}
                                        value={filter.catX}
                                        onChange={(event) =>
                                            onFilterChange(index, 'catX', event.target.value)
                                        }
                                        disabled={!filter.variable}
                                        required
                                    >
                                        <option value="">Selecciona una categoría</option>
                                        {(variablesList[filter.variable] ?? []).map((category) => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            {filter.catY === undefined ? (
                                <button
                                    className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                    type="button"
                                    onClick={() => onFilterChange(index, 'catY', '')}
                                    disabled={!filter.variable}
                                >
                                    Agregar Filtro Bivariado
                                </button>
                            ) : (
                                <div className="rounded-md p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <label
                                            className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                                            htmlFor={`categoryY${index}`}
                                        >
                                            Categoría Y
                                            <select
                                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                                id={`categoryY${index}`}
                                                value={filter.catY}
                                                onChange={(event) =>
                                                    onFilterChange(index, 'catY', event.target.value)
                                                }
                                                disabled={!filter.variable}
                                            >
                                                <option value="">Selecciona una categoría</option>
                                                {(variablesList[filter.variable] ?? []).map((category) => (
                                                    <option key={category} value={category}>
                                                        {category}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <button
                                            className="mt-5 shrink-0 rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                            type="button"
                                            onClick={() => onFilterChange(index, 'catY')}
                                            aria-label={`Eliminar Categoría Y del filtro ${index + 1}`}
                                        >
                                            <b>-</b>
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    );
                })}
            </fieldset>
        </form>
    );
}
