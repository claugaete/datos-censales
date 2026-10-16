import json
import math
import sqlite3
from pathlib import Path

import pandas as pd
from flask import Flask, abort, jsonify, make_response, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
app.url_map.strict_slashes = False
CORS(app)

PROCESSED_DATA_PATH = Path(__file__).resolve().parent / "data" / "processed"
MANZENT_GEOM_PATH = PROCESSED_DATA_PATH / "manzent_geom"
MBTILES_PATH = PROCESSED_DATA_PATH / "comunas.mbtiles"
CRUCES_PATH = PROCESSED_DATA_PATH / "stats" / "cruces"

comunas_bbox = pd.read_json(PROCESSED_DATA_PATH / "comunas_bbox.json", orient="index")
comunas_cut = pd.read_json(
    PROCESSED_DATA_PATH / "comunas_cut.json", orient="index"
).squeeze()
stats_manzent = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "manzent.csv")
stats_h3 = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "h3_comuna.csv")
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


@app.route("/api/")
def hello():
    return "HELLO"


@app.route("/api/tiles/<int:z>/<int:x>/<int:y>/")
def getTiles(z: int, x: int, y: int):
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
    return send_from_directory(PROCESSED_DATA_PATH, "comunas.json")


@app.route("/api/list/variables")
def getVariableList():
    return send_from_directory(PROCESSED_DATA_PATH / "stats", "variables.json")


@app.route("/api/comuna/<comuna>/bbox/")
def getComunaBbox(comuna: str):
    try:
        return comunas_bbox.loc[comuna].to_dict()
    except KeyError:
        abort(404)


@app.route("/api/comuna/<comuna>/manzent-geom")
def getComunaManzentGeom(comuna: str):
    return send_from_directory(MANZENT_GEOM_PATH, f"{comuna}.fgb")


def getComunaData(
    comuna: str,
    comuna_data_dict: dict[str, pd.DataFrame],
    var1: str,
    cat1: str,
    var2: str,
    cat2: str,
    view: str,
):
    # obtenemos data general de cada manzent
    general_data = comuna_data_dict.get(comuna)
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
                CRUCES_PATH / f"cruces_{comunas_cut.loc[comuna]}.parquet",
                filters=[
                    ("var1", "==", var1),
                    ("cat1", "==", cat1),
                    ("var2", "==", var2),
                    ("cat2", "==", cat2),
                ],
            )
            .set_index("MANZENT")["conteo"]
            .fillna(0)
            .astype(float)
        )
    except FileNotFoundError:
        abort(404, "NoData")
    if len(count_data) == 0:
        abort(404, "NoCat")

    # hay que hacer un dropna porque en algunos casos la "manzana" con mayor
    # población es una manzana que en verdad no existe (9999), con lo cual la
    # leyenda queda mal
    all_data = (
        pd.concat([general_data, count_data], axis=1)
        .dropna(subset=["poblacion"])
        .fillna(0)
    )
    all_data["densidad"] = all_data["conteo"] / all_data["area"]
    all_data["porcentaje"] = all_data["conteo"] / all_data["poblacion"]

    try:
        max_value = all_data[view].max()
    except KeyError:
        abort(404, "NoView")

    data_json = json.loads(all_data.to_json(orient="records"))
    payload = {
        "max_value": max_value,
        "data": data_json,
    }
    return jsonify(payload)


@app.route("/api/comuna/<comuna>/manzent-data")
def getComunaManzentData(comuna: str):
    var1 = request.args.get("var1")
    cat1 = request.args.get("cat1")
    var2 = request.args.get("var2")
    cat2 = request.args.get("cat2")
    view = request.args.get("view")
    return getComunaData(comuna, stats_manzent_grouped, var1, cat1, var2, cat2, view)


@app.route("/api/comuna/<comuna>/h3-data")
def getComunaH3Data(comuna: str):
    abort(404, "NotImplemented")


if __name__ == "__main__":
    app.run(port=8080)
