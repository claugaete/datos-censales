import json
import logging
import math
import sqlite3
from pathlib import Path
from typing import Literal, TypedDict

import pandas as pd
from flask import Flask, abort, jsonify, make_response, request, send_from_directory
from flask_cors import CORS
from mapclassify import Quantiles
from werkzeug.exceptions import HTTPException

app = Flask(__name__)
app.url_map.strict_slashes = False
CORS(app)
logger = logging.getLogger()


class Filter(TypedDict):
    var: str
    catX: str
    catY: str | None


PROCESSED_DATA_PATH = Path(__file__).resolve().parent / "data" / "processed"
MANZENT_GEOM_PATH = PROCESSED_DATA_PATH / "manzent_geom"
MBTILES_PATH = PROCESSED_DATA_PATH / "comunas.mbtiles"
STATS_PATH = PROCESSED_DATA_PATH / "stats"

comunas_bbox = pd.read_json(PROCESSED_DATA_PATH / "comunas_bbox.json", orient="index")
comunas_cut = pd.read_json(
    PROCESSED_DATA_PATH / "comunas_cut.json", orient="index"
).squeeze()
conurbaciones_bbox = pd.read_json(
    PROCESSED_DATA_PATH / "conurbaciones_bbox.json", orient="index"
)

stats_manzent = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "manzent.csv")
stats_h3 = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "h3_comuna.csv")
stats_conurbaciones = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "h3_conurbacion.csv")

cruces_variables = pd.read_json(
    PROCESSED_DATA_PATH / "stats" / "variables.json", orient="index"
).index.to_list()

stats_manzent_grouped = {
    comuna: group.set_index("MANZENT", drop=False).drop(columns="COMUNA")
    for comuna, group in stats_manzent.groupby("COMUNA")
}
stats_h3_grouped = {
    comuna: group.set_index("hex_id", drop=False).drop(columns="COMUNA")
    for comuna, group in stats_h3.groupby("COMUNA")
}
stats_conurbacion_grouped = {
    conurbacion: group.set_index("hex_id", drop=False).drop(columns="CONURBACION")
    for conurbacion, group in stats_conurbaciones.groupby("CONURBACION")
}


@app.errorhandler(HTTPException)
def handle_exception(e):
    return jsonify(
        {
            "error": e.name,
            "message": e.description,
        }
    ), e.code


@app.route("/api/")
def hello():
    return "HELLO"


@app.route("/api/tiles/<int:z>/<int:x>/<int:y>/")
def getTiles(z: int, x: int, y: int):
    """
    Obtiene las tiles correspondientes a las comunas visibles según el
    viewport actual.
    """

    # convert xyz to tms
    tms_y = int(math.pow(2, z) - 1 - y)

    conn = sqlite3.connect(MBTILES_PATH)
    cursor = conn.cursor()

    cursor.execute(
        "SELECT tile_data FROM tiles WHERE "
        "zoom_level=? AND tile_column=? AND tile_row=?",
        (z, x, tms_y),
    )
    tile = cursor.fetchone()
    conn.close()

    if not tile:
        return b"", 200, {"Content-Type": "application/vnd.mapbox-vector-tile"}

    response = make_response(tile[0])
    response.headers["Content-Type"] = "application/vnd.mapbox-vector-tile"
    response.headers["Content-Encoding"] = "gzip"
    # response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.route("/api/list/comunas")
def getComunaList():
    """Retorna una lista que asocia a cada región con sus comunas."""
    return send_from_directory(PROCESSED_DATA_PATH, "comunas.json")


@app.route("/api/list/conurbaciones")
def getConurbacionList():
    """Retorna una lista que asocia a cada región con sus conurbaciones."""
    return send_from_directory(PROCESSED_DATA_PATH, "conurbaciones.json")


@app.route("/api/list/conurbaciones-comunas")
def getConurbacionComunaList():
    """Retorna una lista que asocia a cada conurbación con sus comunas."""
    return send_from_directory(PROCESSED_DATA_PATH, "conurbaciones_comunas.json")


@app.route("/api/list/variables")
def getVariableList():
    """Retorna una lista que asocia cada variable (de los cruces realizados)
    con sus categorías posibles."""
    return send_from_directory(PROCESSED_DATA_PATH / "stats", "variables.json")


@app.route("/api/comuna/<comuna>/bbox/")
def getComunaBbox(comuna: str):
    """
    Retorna la bounding box de la comuna solicitada, como un JSON con 4
    variables (`minx`, `miny`, `maxx`, `maxy`).
    """

    try:
        return comunas_bbox.loc[comuna].to_dict()
    except KeyError:
        abort(404)


@app.route("/api/conurbacion/<conurbacion>/bbox/")
def getConurbacionBbox(conurbacion: str):
    """
    Retorna la bounding box de la conurbación solicitada, como un JSON con 4
    variables (`minx`, `miny`, `maxx`, `maxy`).
    """

    try:
        return conurbaciones_bbox.loc[conurbacion].to_dict()
    except KeyError:
        abort(404)


@app.route("/api/comuna/<comuna>/manzent-geom")
def getComunaManzentGeom(comuna: str):
    """
    Retorna la geometría de las manzanas/entidades de la comuna solicitada.
    """
    return send_from_directory(MANZENT_GEOM_PATH, f"{comuna}.fgb")


def getPlaceData(
    place: str,
    dataType: Literal["manzent", "h3_comuna", "h3_conurbacion"],
    var1: str,
    cat1: str,
    var2: str,
    cat2: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Obtiene los siguientes datos para cada "celda" de una comuna/conurbación
    dada:

    - El conteo de personas para las cuales `var1` toma el valor `cat1` y
      `var2` toma el valor `cat2`.
    - La densidad (superficial) de personas que cumplen la condición anterior.
    - El porcentaje de la población total que representan las personas que
      cumplen la condición.
    """

    if dataType == "manzent":
        general_data = stats_manzent_grouped.get(place)
        file_path = Path("cruces") / f"cruces_{comunas_cut.loc[place]}.parquet"
    elif dataType == "h3_comuna":
        general_data = stats_h3_grouped.get(place)
        file_path = Path("cruces_h3") / f"cruces_{comunas_cut.loc[place]}.parquet"
    else:
        general_data = stats_conurbacion_grouped.get(place)
        file_path = Path("cruces_conurbacion") / f"cruces_{place}.parquet"

    if general_data is None:
        abort(404, "NoComuna")

    # damos vuelta variables si es necesario (abortamos si una de las
    # variables no existe)
    try:
        if cruces_variables.index(var1) > cruces_variables.index(var2):
            var1, var2 = var2, var1
            cat1, cat2 = cat2, cat1
    except ValueError:
        abort(404, "NoVar")

    # leemos los conteos solicitados
    try:
        count_data = (
            pd.read_parquet(
                STATS_PATH / file_path,
                filters=[
                    ("var1", "==", var1),
                    ("cat1", "==", cat1),
                    ("var2", "==", var2),
                    ("cat2", "==", cat2),
                ],
            )
            .set_index("MANZENT" if dataType == "manzent" else "hex_id")[["conteo"]]
            # solo manzanas válidas en la comuna
            .reindex(general_data.index)
            .fillna(0)
            .astype(float)
        )
    except FileNotFoundError:
        abort(404, "NoData")
    if len(count_data) == 0:
        abort(404, "NoCat")

    count_data["densidad"] = count_data["conteo"] / general_data["area"]
    count_data["porcentaje"] = count_data["conteo"] / general_data["poblacion"]

    return general_data, count_data


def getUnivariatePlaceData(
    place: str, dataType: Literal["manzent", "h3"], filters: list[Filter]
):
    """
    Obtiene los siguientes datos para cada "celda" de una comuna/conurbación
    dada:

    - La población total y superficie de la "celda".
    - El conteo de personas que cumplen todos los filtros de `filters` (el
      valor de cada `var` es igual a su respectivo `catX`).
    - La densidad (superficial) de personas que cumplen la condición anterior.
    - El porcentaje de la población total que representan las personas que
      cumplen la condición.

    Además, retorna el valor máximo para estas últimas tres variables.
    """

    general_data, count_data = getPlaceData(
        place,
        dataType,
        filters[0].get("var"),
        filters[0].get("catX"),
        filters[1].get("var"),
        filters[1].get("catX"),
    )

    all_data = pd.concat([general_data, count_data], axis=1)

    max_values = {
        column: all_data[column].max()
        for column in ("conteo", "densidad", "porcentaje")
    }

    data_json = json.loads(all_data.to_json(orient="records"))
    payload = {
        "legend": max_values,
        "data": data_json,
    }
    return jsonify(payload)


def getBivariatePlaceData(
    place: str,
    dataType: Literal["manzent", "h3"],
    filters: list[dict[str, str]],
):
    """
    Obtiene los siguientes datos para cada "celda" de una comuna/conurbación
    dada:

    - La población total y superficie de la "celda".
    - Los siguientes conteos de personas:
        - X: el valor de cada `var` es igual a su respectivo `catX`.
        - Y: el valor de cada `var` es igual a su respectivo `catY` (o `catX`
          si `catY` es nulo).
    - La densidad (superficial) de personas que cumplen cada una de las
      condiciones anteriores.
    - El porcentaje de la población total que representan las personas que
      cumplen cada una de las condiciones anteriores.

    Además, divide cada una de estas tres distribuciones en tres "bins",
    entregando los límites entre bins.
    """

    general_data, count_data_X = getPlaceData(
        place,
        dataType,
        filters[0].get("var"),
        filters[0].get("catX"),
        filters[1].get("var"),
        filters[1].get("catX"),
    )

    _, count_data_Y = getPlaceData(
        place,
        dataType,
        filters[0].get("var"),
        filters[0].get("catY") or filters[0].get("catX"),
        filters[1].get("var"),
        filters[1].get("catY") or filters[1].get("catX"),
    )

    legend = {}

    for axis, count_data in zip(("X", "Y"), (count_data_X, count_data_Y)):
        bins = {
            column: Quantiles(count_data[column].dropna(), k=3).bins.tolist()
            for column in ("conteo", "densidad", "porcentaje")
        }

        legend[axis] = bins

        general_data[axis] = general_data.index.map(count_data.to_dict(orient="index"))

    data_json = json.loads(general_data.to_json(orient="records"))

    payload = {
        "legend": legend,
        "data": data_json,
    }
    return jsonify(payload)


def getFiltersFromRequest() -> list[Filter]:
    """
    Obtiene los filtros requeridos por una consulta de datos.
    """
    filter_strings = request.args.getlist("filter")
    if len(filter_strings) != 2:
        abort(400, "InvalidFilterLength")

    parsed_filters = []
    for filter_string in filter_strings:
        parts = filter_string.split(":")
        if len(parts) not in (2, 3) or not all(parts):
            abort(400, "InvalidFilterContent")
        parsed_filters.append(
            {
                "var": parts[0],
                "catX": parts[1],
                "catY": parts[2] if len(parts) == 3 else None,
            }
        )

    return parsed_filters


@app.route("/api/comuna/<comuna>/manzent-data/")
def getComunaManzentData(comuna: str):
    """
    Obtiene los datos de `getPlaceData` para cada manzana/entidad de una
    comuna.
    """

    filters = getFiltersFromRequest()
    if any(f["catY"] is not None for f in filters):
        return getBivariatePlaceData(comuna, "manzent", filters)
    return getUnivariatePlaceData(comuna, "manzent", filters)


@app.route("/api/comuna/<comuna>/h3-data")
def getComunaH3Data(comuna: str):
    """
    Obtiene los datos de `getPlaceData` para cada celda de H3 de una comuna
    (solo considerando su área urbana).
    """

    filters = getFiltersFromRequest()
    if any(f["catY"] is not None for f in filters):
        return getBivariatePlaceData(comuna, "h3_comuna", filters)
    return getUnivariatePlaceData(comuna, "h3_comuna", filters)


@app.route("/api/conurbacion/<conurbacion>/h3-data")
def getConurbacionH3Data(conurbacion: str):
    """
    Obtiene los datos de `getPlaceData` para cada celda de H3 de una
    conurbación.
    """

    filters = getFiltersFromRequest()
    if any(f["catY"] is not None for f in filters):
        return getBivariatePlaceData(conurbacion, "h3_conurbacion", filters)
    return getUnivariatePlaceData(conurbacion, "h3_conurbacion", filters)


if __name__ == "__main__":
    app.run(port=8080)
