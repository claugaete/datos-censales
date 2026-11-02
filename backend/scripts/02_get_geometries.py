# %% [markdown]
# # Obtención de geometrías para visualización web
#
# Este script genera los archivos necesarios para poder visualizar las
# geometrías de comunas y manzanas en la aplicación web.

# %%
import subprocess
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import unary_union
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

INTERIM_DATA_PATH = DATA_PATH / "interim"
PROCESSED_DATA_PATH = DATA_PATH / "processed"

# %% [markdown]
# ## Generación de JSONs intermedios para comunas y conurbaciones

# %%
region_order = [
    "ARICA Y PARINACOTA",
    "TARAPACÁ",
    "ANTOFAGASTA",
    "ATACAMA",
    "COQUIMBO",
    "VALPARAÍSO",
    "METROPOLITANA DE SANTIAGO",
    "LIBERTADOR GENERAL BERNARDO O'HIGGINS",
    "MAULE",
    "ÑUBLE",
    "BIOBÍO",
    "LA ARAUCANÍA",
    "LOS RÍOS",
    "LOS LAGOS",
    "AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO",
    "MAGALLANES Y DE LA ANTÁRTICA CHILENA",
]

# %%
comunas = gpd.read_parquet(
    INTERIM_DATA_PATH / "censo" / "Cartografia_censo2024_Pais_Comunal.parquet"
)

# %%
limites_urbanos = gpd.read_parquet(
    INTERIM_DATA_PATH / "censo" / "Cartografia_censo2024_Pais_Limite_Urbano.parquet"
)

# %%
# creamos un JSON asociando cada comuna con su CUT
comunas.set_index("COMUNA")["CUT"].to_json(
    PROCESSED_DATA_PATH / "comunas_cut.json", orient="index"
)

# %%
# creamos un JSON asociando cada región con sus comunas, para poder
# seleccionar entre las distintas comunas en el frontend a partir de la región
comunas.sort_values("COMUNA").groupby("REGION")["COMUNA"].apply(list).reindex(
    region_order
).to_json(PROCESSED_DATA_PATH / "comunas.json")

# %%
# creamos un JSON con la bounding box de cada comuna, para poder hacer zoom
# hacia la bbox en la aplicación web incluso cuando los datos aún están
# cargando
comunas.set_index("COMUNA").bounds.to_json(
    PROCESSED_DATA_PATH / "comunas_bbox.json", orient="index"
)

# %%
# recreamos los dos jsons anteriores para conurbaciones
limites_urbanos.sort_values("CONURBACION").drop_duplicates(subset="CONURBACION").dropna(
    subset="CONURBACION"
).groupby("REGION")["CONURBACION"].apply(list).reindex(
    region_order, fill_value=[]
).to_json(PROCESSED_DATA_PATH / "conurbaciones.json")

# %%
gpd.GeoSeries(
    limites_urbanos.groupby("CONURBACION")["SHAPE"].aggregate(unary_union), crs=4326
).bounds.to_json(PROCESSED_DATA_PATH / "conurbaciones_bbox.json", orient="index")

# %%
# asociamos cada conurbación con las comunas que están involucradas (para no
# mostrarlas en la visualización si se está visualizando la conurbación)
limites_urbanos.sort_values("CONURBACION").groupby("CONURBACION")["COMUNA"].apply(
    list
).to_json(PROCESSED_DATA_PATH / "conurbaciones_comunas.json")

# %% [markdown]
# ## Generación de MBTiles para comunas

# %%
comunas.to_file(INTERIM_DATA_PATH / "comunas.geojsonl")

# %%
subprocess.run(
    [
        "tippecanoe",
        "-zg",
        "--force",
        "-o",
        PROCESSED_DATA_PATH / "comunas.mbtiles",
        INTERIM_DATA_PATH / "comunas.geojsonl",
    ],
    check=True,
)

# %% [markdown]
# ## Generación de geometrías Manzana-Entidad

# %%
manzanas = gpd.read_parquet(
    INTERIM_DATA_PATH / "censo" / "Cartografia_censo2024_Pais_Manzanas.parquet"
)
entidades = gpd.read_parquet(
    INTERIM_DATA_PATH / "censo" / "Cartografia_censo2024_Pais_Entidades.parquet"
)

# %%
manzent = pd.concat([manzanas, entidades], ignore_index=True).to_crs(4326)
manzent = manzent.rename_geometry("geometry").set_index("MANZENT")[
    ["COMUNA", "AREA_C", "geometry"]
]

# %%
# simplificar la geometría de cada geodataframe (simplificamos manzanas menos, entidades más)
MANZANA_TOLERANCE = 1e-5
ENTIDAD_TOLERANCE = 1e-4

for comuna, group in tqdm(manzent.groupby("COMUNA")):
    manzanas_mask = group["AREA_C"] == "URBANO"
    group.loc[manzanas_mask, "geometry"] = group.loc[
        manzanas_mask, "geometry"
    ].simplify_coverage(tolerance=MANZANA_TOLERANCE, simplify_boundary=True)
    group.loc[~manzanas_mask, "geometry"] = group.loc[
        ~manzanas_mask, "geometry"
    ].simplify_coverage(tolerance=ENTIDAD_TOLERANCE, simplify_boundary=True)
    group.geometry.to_file(
        PROCESSED_DATA_PATH / "manzent_geom" / f"{comuna}.fgb", driver="FlatGeobuf"
    )
