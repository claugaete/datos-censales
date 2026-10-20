const DATA_TYPES = ['manzent', 'h3'] as const;

/**
 * Tipo de dato que se puede solicitar a nivel de comuna.
 */
export type DataType = (typeof DATA_TYPES)[number];
export function isDataType(value: unknown): value is DataType {
    return (
        typeof value === 'string' && DATA_TYPES.some((dataType) => dataType === value)
    );
}

const VIEW_TYPES = ['conteo', 'densidad', 'porcentaje'] as const;

/**
 * Vistas posibles para los datos solicitados.
 */
export type ViewType = (typeof VIEW_TYPES)[number];
export function isView(value: unknown): value is ViewType {
    return typeof value === 'string' && VIEW_TYPES.some((view) => view === value);
}

/**
 * Valor máximo de cada vista posible en los datos solicitados.
 */
export type MaxValues = Record<ViewType, number>;
export const MAX_VALUES_DEFAULT: MaxValues = {
    conteo: 0,
    densidad: 0,
    porcentaje: 0,
};

/**
 * Filtros para los datos recibidos.
 */
export type Filter = {
    variable: string;
    catX: string;
    catY?: string;
};
