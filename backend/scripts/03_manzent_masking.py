# %% [markdown]
# # *Masking* de manzanas
#
# En este script, realizaremos *masking* de las manzanas para solamente incluir
# el área que posee edificios. Esto entregará resultados más precisos a la hora
# de realizar cambio de soporte a celdas H3. Actualmente, solo estamos
# realizando *masking* para las manzanas, ya que no estamos considerando áreas
# rurales en las visualizaciones con celdas H3.
#
# Para realizar el *masking*, se necesitan las geometrías de edificios a nivel
# país. Estas se pueden descargar en formato CSV comprimido desde [este
# enlace](https://colab.research.google.com/github/google-research/google-research/blob/master/building_detection/open_buildings_download_region_polygons.ipynb),
# usando las opciones "Natural Earth (Low Res 110m)" para `region_border_source`
# y "CHL (Chile)" para `region`. El archivo descomprimido debe encontrarse en
# `data/interim/open_buildings_v3_polygons_ne_110m_CHL.csv`.

# %%
from pathlib import Path

import duckdb
import geopandas as gpd
import pandas as pd
from shapely import unary_union, wkt
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

CENSO_DATA_PATH = DATA_PATH / "interim" / "censo"
MASKS_DATA_PATH = DATA_PATH / "interim" / "masking"
BUILDINGS_DATA_PATH = (
    DATA_PATH / "interim" / "open_buildings_v3_polygons_ne_110m_CHL.csv"
)

MASKS_DATA_PATH.mkdir(exist_ok=True)

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
# faster clipping function, from tobler's binary dasymetric interpolation
# guide: https://pysal.org/tobler/stable/user-guide/binary_dasymetric.html
def iterclip(source: gpd.GeoDataFrame, mask: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    tree = mask.sindex
    features = []
    for idx, row in source.iterrows():
        query = tree.query(source.geometry.loc[idx], predicate="intersects").tolist()
        submask = mask[mask.index.isin(query)]
        single = gpd.GeoDataFrame(row.to_frame().T, crs=source.crs)
        features.append(gpd.clip(single, submask))
    frame = gpd.GeoDataFrame(pd.concat(features), crs=source.crs)
    return frame


# %%
with tqdm(manzanas["COMUNA"].unique()) as iter:
    for comuna in iter:
        iter.set_description(comuna)

        manzanas_comuna = manzanas.loc[manzanas["COMUNA"] == comuna, ["geometry"]]
        minx, miny, maxx, maxy = manzanas_comuna.total_bounds

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

        manzanas_clipped = gpd.GeoDataFrame(
            manzanas_comuna.reset_index()
            .overlay(buildings_comuna_gdf[["geometry"]])
            .groupby("MANZENT")
            .geometry.agg(lambda polys: unary_union(polys, grid_size=1e-6)),
            crs=4326,
        )

        manzanas_clipped.to_parquet(MASKS_DATA_PATH / f"{comuna}.parquet")
