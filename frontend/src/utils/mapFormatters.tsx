import chroma, { Scale } from 'chroma-js';

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
 * Obtiene el color asociado a un cierto valor, para una sola variable.
 *
 * @param value El valor de la celda.
 * @param maxValue El valor máximo entre las celdas (asociado al color máximo
 * de la escala).
 * @returns Color asociado al valor, en formato RGB.
 */
export function getUnivariateColor(
    value: number | null,
    maxValue: number,
    scale: Scale,
    nanColor: [number, number, number],
) {
    if (typeof value !== 'number') return nanColor;
    const fraction = maxValue > 0 ? value / maxValue : 0;
    return scale(fraction).rgb() as [number, number, number];
}

/**
 * Obtiene el color asociado a un cierto valor, para dos variables.
 *
 * @param valueX El valor de la celda para la variable X.
 * @param valueY El valor de la celda para la variable Y.
 * @param binsX La cota superior para cada uno de los "grupos" en los que se
 * divide la variable X.
 * @param binsY La cota superior para cada uno de los "grupos" en los que se
 * divide la variable Y.
 * @returns Color asociado al valor, en formato RGB.
 */
export function getBivariateColor(
    valueX: number | null,
    valueY: number | null,
    binsX: [number, number, number],
    binsY: [number, number, number],
    bivariateColors: string[][],
    nanColor: [number, number, number],
) {
    if (typeof valueX !== 'number' || typeof valueY !== 'number') return nanColor;

    const colorX = valueX <= binsX[0] ? 0 : valueX <= binsX[1] ? 1 : 2;
    const colorY = valueY <= binsY[0] ? 0 : valueY <= binsY[1] ? 1 : 2;

    return chroma(bivariateColors[colorY][colorX]).rgb() as [number, number, number];
}
