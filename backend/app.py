import json
import math
import sqlite3
from pathlib import Path

import pandas as pd
from flask import Flask, abort, jsonify, make_response, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
app.url_map.strict_slashes = False
CORS(app)

PROCESSED_DATA_PATH = Path("data") / "processed"
MANZENT_GEOM_PATH = PROCESSED_DATA_PATH / "manzent_geom"
MBTILES_PATH = PROCESSED_DATA_PATH / "comunas.mbtiles"

comunas_bbox = pd.read_json(PROCESSED_DATA_PATH / "comunas_bbox.json", orient="index")
stats_manzent = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "manzent.csv", index_col=0)
stats_h3 = pd.read_csv(PROCESSED_DATA_PATH / "stats" / "h3_comuna.csv", index_col=0)

stats_manzent_grouped = {
    comuna: group.reset_index().drop(columns="COMUNA")
    for comuna, group in stats_manzent.groupby("COMUNA")
}
stats_h3_grouped = {
    comuna: group.reset_index().drop(columns="COMUNA")
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


@app.route("/api/comuna-list/")
def getComunaList():
    return send_from_directory(PROCESSED_DATA_PATH, "comunas.json")


@app.route("/api/comuna/<comuna>/bbox/")
def getComunaBbox(comuna: str):
    try:
        return comunas_bbox.loc[comuna].to_dict()
    except KeyError:
        abort(404)


@app.route("/api/comuna/<comuna>/manzent-geom")
def getComunaManzentGeom(comuna: str):
    return send_from_directory(MANZENT_GEOM_PATH, f"{comuna}.fgb")


def getComunaData(comuna: str, comuna_data_dict: dict[str, pd.DataFrame]):
    data = comuna_data_dict.get(comuna)
    if data is None:
        abort(404)
    else:
        data_json = json.loads(data.to_json(orient="records"))
        payload = {
            "max_population": data["n_per"].max(),
            "data": data_json,
        }
        return jsonify(payload)


@app.route("/api/comuna/<comuna>/manzent-data")
def getComunaManzentData(comuna: str):
    return getComunaData(comuna, stats_manzent_grouped)


@app.route("/api/comuna/<comuna>/h3-data")
def getComunaH3Data(comuna: str):
    return getComunaData(comuna, stats_h3_grouped)


if __name__ == "__main__":
    app.run(port=8080)
