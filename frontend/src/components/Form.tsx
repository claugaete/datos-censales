import type { SubmitEventHandler } from 'react';
import { DataType, ViewType } from '../types';

// mapeo de cada tipo de dato con el texto a mostrar en el formulario
const DATA_TYPE_OPTIONS: Record<DataType, string> = {
    manzent: 'Manzanas',
    h3: 'H3 (Área Urbana)',
};

// mapeo de cada vista con el texto a mostrar en el formulario
const VIEW_OPTIONS: Record<ViewType, string> = {
    conteo: 'Conteo',
    densidad: 'Densidad',
    porcentaje: 'Porcentaje',
};

type FormProps = {
    comunasByRegion: Record<string, string[]>;
    variablesList: Record<string, string[]>;
    selectedRegion: string;
    selectedComuna: string;
    selectedDataType: string;
    selectedView: string;
    selectedVariable1: string;
    selectedCategory1: string;
    selectedVariable2: string;
    selectedCategory2: string;
    onRegionChange: (region: string) => void;
    onComunaChange: (comuna: string) => void;
    onDataTypeChange: (newType: string) => void;
    onViewChange: (newView: string) => void;
    onVariable1Change: (variable: string) => void;
    onCategory1Change: (category: string) => void;
    onVariable2Change: (variable: string) => void;
    onCategory2Change: (category: string) => void;
    onSubmit: SubmitEventHandler<HTMLFormElement>;
};

export function Form({
    comunasByRegion,
    variablesList,
    selectedRegion,
    selectedComuna,
    selectedDataType,
    selectedView,
    selectedVariable1,
    selectedCategory1,
    selectedVariable2,
    selectedCategory2,
    onRegionChange,
    onComunaChange,
    onDataTypeChange,
    onViewChange,
    onVariable1Change,
    onCategory1Change,
    onVariable2Change,
    onCategory2Change,
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
                htmlFor="region"
            >
                Región
                <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    id="region"
                    value={selectedRegion}
                    onChange={(event) => {
                        onRegionChange(event.target.value);
                        onComunaChange('');
                    }}
                    required
                >
                    <option value="">Selecciona una región</option>
                    {Object.keys(comunasByRegion).map((regionName) => (
                        <option key={regionName} value={regionName}>
                            {regionName}
                        </option>
                    ))}
                </select>
            </label>

            <label
                className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                htmlFor="comuna"
            >
                Comuna
                <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    id="comuna"
                    value={selectedComuna}
                    onChange={(event) => onComunaChange(event.target.value)}
                    disabled={!selectedRegion}
                    required
                >
                    <option value="">Selecciona una comuna</option>
                    {(comunasByRegion[selectedRegion] ?? []).map((comunaName) => (
                        <option key={comunaName} value={comunaName}>
                            {comunaName}
                        </option>
                    ))}
                </select>
            </label>

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
            <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
                <label
                    className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                    htmlFor="variable1"
                >
                    Variable 1
                    <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                        id="variable1"
                        value={selectedVariable1}
                        onChange={(event) => onVariable1Change(event.target.value)}
                        required
                    >
                        <option value="">Selecciona una variable</option>
                        {variableNames.map((variable) => (
                            <option key={variable} value={variable}>
                                {variable}
                            </option>
                        ))}
                    </select>
                </label>

                <label
                    className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                    htmlFor="category1"
                >
                    Categoría 1
                    <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        id="category1"
                        value={selectedCategory1}
                        onChange={(event) => onCategory1Change(event.target.value)}
                        disabled={!selectedVariable1}
                        required
                    >
                        <option value="">Selecciona una categoría</option>
                        {(variablesList[selectedVariable1] ?? []).map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </label>

                <label
                    className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                    htmlFor="variable2"
                >
                    Variable 2
                    <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                        id="variable2"
                        value={selectedVariable2}
                        onChange={(event) => onVariable2Change(event.target.value)}
                        required
                    >
                        <option value="">Selecciona una variable</option>
                        {variableNames
                            .filter((variable) => variable !== selectedVariable1)
                            .map((variable) => (
                                <option key={variable} value={variable}>
                                    {variable}
                                </option>
                            ))}
                    </select>
                </label>

                <label
                    className="flex flex-col gap-1 text-sm font-medium text-slate-700"
                    htmlFor="category2"
                >
                    Categoría 2
                    <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        id="category2"
                        value={selectedCategory2}
                        onChange={(event) => onCategory2Change(event.target.value)}
                        disabled={!selectedVariable2}
                        required
                    >
                        <option value="">Selecciona una categoría</option>
                        {(variablesList[selectedVariable2] ?? []).map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </label>
            </fieldset>
        </form>
    );
}
