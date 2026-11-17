# %% [markdown]
# # *Masking* de manzanas
#
# En este script, realizaremos *masking* de las manzanas para solamente incluir
# el área que posee edificios. Esto entregará resultados más precisos a la hora
# de realizar cambio de soporte a celdas H3. Actualmente, solo estamos
# realizando *masking* para las manzanas, ya que no estamos considerando áreas
# rurales en las visualizaciones con celdas H3.

# %%
from pathlib import Path

import duckdb
import geopandas as gpd
import quackosm as qosm
from shapely import unary_union, wkt
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

CENSO_DATA_PATH = DATA_PATH / "interim" / "censo"
MASKS_DATA_PATH = DATA_PATH / "interim" / "masking"
BUILDINGS_DATA_PATH = (
    DATA_PATH / "interim" / "open_buildings_v3_polygons_your_own_wkt_polygon.csv"
)

MASKS_DATA_PATH.mkdir(exist_ok=True)

# %% [markdown]
# Para realizar el *masking*, se necesitan las geometrías de edificios a nivel
# país. Estas se pueden descargar en formato CSV comprimido desde [este
# enlace](https://colab.research.google.com/github/google-research/google-research/blob/master/building_detection/open_buildings_download_region_polygons.ipynb),
# usando el polígono retornado por la celda siguiente como área de interés
# (cambiar `PRINT_POLYGON_COORDS` a True).
#
# No se recomienda usar las regiones proporcionadas por el Colab, ya que
# excluyen ciertas zonas costeras (y, en el caso del dataset de menor
# resolución, comunas enteras como Talcahuano).

# %%
PRINT_POLYGON_COORDS = False
if PRINT_POLYGON_COORDS:
    regiones = gpd.read_parquet(
        CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Regional.parquet"
    )
    print(regiones.convex_hull.union_all().wkt)

# %%
manzanas = (
    gpd.read_parquet(CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Manzanas.parquet")
    .rename_geometry("geometry")
    .set_index("MANZENT")
    .to_crs(4326)[["COMUNA", "geometry"]]
)

# %%
con = duckdb.connect()
con.execute("SET enable_progress_bar = false;")
con.execute("INSTALL spatial; LOAD spatial;")

# %%
# cargamos todos los edificios y áreas de Chile que no sean residenciales
# (no son tantas, ~100k, por lo que es mejor mantenerlas en memoria siempre)
pois_gdf = qosm.convert_pbf_to_geodataframe(
    DATA_PATH / "raw" / "Chile.osm.pbf",
    tags_filter={
        "amenity": True,
        "shop": True,
        "tourism": True,
        "leisure": True,
        "office": True,
        "building": ["commercial", "industrial", "office"],
    },
    working_directory=DATA_PATH / "interim" / "quackosm",
    keep_all_tags=False,
    explode_tags=False,
    verbosity_mode="silent",
).to_crs(4326)
pois_gdf = pois_gdf[pois_gdf.geom_type.isin(["Polygon", "MultiPolygon"])]

# %%
with tqdm(manzanas.groupby("COMUNA")) as iter:
    for comuna, manzanas_comuna in iter:
        iter.set_description(comuna)

        minx, miny, maxx, maxy = manzanas_comuna.total_bounds

        pois_comuna_gdf = pois_gdf.cx[minx:maxx, miny:maxy]

        # para los edificios tenemos que usar DuckDB para consultar el archivo
        # CSV, filtrando por la bbox de la comuna cada vez (no podemos
        # cargarlo en memoria como hicimos con el archivo de OSM, ya que son
        # más de 10 millones de edificios)
        buildings_comuna_df = con.execute(f"""
            SELECT * FROM read_csv_auto('{BUILDINGS_DATA_PATH}')
            WHERE ST_Intersects(
                ST_GeomFromText(geometry),
                ST_MakeEnvelope({minx}, {miny}, {maxx}, {maxy})
            )
            AND confidence >= 0.75
        """).df()

        buildings_comuna_gdf = gpd.GeoDataFrame(
            buildings_comuna_df,
            geometry=buildings_comuna_df["geometry"].apply(wkt.loads),
            crs=4326,
        )

        manzanas_clipped = manzanas_comuna[["geometry"]].reset_index()
        if len(pois_comuna_gdf) > 0:
            manzanas_clipped = manzanas_clipped.overlay(
                pois_comuna_gdf[["geometry"]],
                how="difference",
                keep_geom_type=True,
            )
        if len(buildings_comuna_gdf) > 0:
            manzanas_clipped = manzanas_clipped.overlay(
                buildings_comuna_gdf[["geometry"]],
                keep_geom_type=True,
            )
        manzanas_clipped = gpd.GeoDataFrame(
            manzanas_clipped.groupby("MANZENT").geometry.agg(
                lambda polys: unary_union(polys, grid_size=1e-6)
            ),
            crs=4326,
        )

        manzanas_clipped.to_parquet(MASKS_DATA_PATH / f"{comuna}.parquet")
