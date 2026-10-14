# %% [markdown]
# # Obtención de geometrías para visualización web
#
# Este script genera los archivos necesarios para poder visualizar las
# geometrías de comunas y manzanas en la aplicación web.

# %%
import subprocess
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

INTERIM_DATA_PATH = DATA_PATH / "interim"
PROCESSED_DATA_PATH = DATA_PATH / "processed"

# %% [markdown]
# ## Generación de JSONs intermedios para comunas

# %%
comunas = gpd.read_parquet(
    INTERIM_DATA_PATH / "censo" / "Cartografia_censo2024_Pais_Comunal.parquet"
)

# %%
# creamos un JSON asociando cada región con sus comunas, para poder
# seleccionar entre las distintas comunas en el frontend a partir de la región
comunas.sort_values("COMUNA").groupby("REGION")["COMUNA"].apply(list).reindex(
    [
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
).to_json(PROCESSED_DATA_PATH / "comunas.json")

# %%
# creamos un JSON con la bounding box de cada comuna, para poder hacer zoom
# hacia la bbox en la aplicación web incluso cuando los datos aún están
# cargando
comunas.set_index("COMUNA").bounds.to_json(
    PROCESSED_DATA_PATH / "comunas_bbox.json", orient="index"
)

# %%
comunas_bbox = pd.read_json(PROCESSED_DATA_PATH / "comunas_bbox.json", orient="index")

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
    ["COMUNA", "geometry"]
]

# %%
# simplificar la geometría de cada geodataframe de manera proporcional a su
# tamaño (así, comunas más pequeñas reciben menos modificaciones)
fraction = 0.0001

for comuna, group in tqdm(manzent.groupby("COMUNA")):
    minx, miny, maxx, maxy = group.total_bounds
    diagonal = np.sqrt((maxx - minx) ** 2 + (maxy - miny) ** 2)
    tolerance = diagonal * fraction
    manzent_geom: gpd.GeoSeries = group.geometry.simplify(tolerance=diagonal * fraction)
    manzent_geom.to_file(
        PROCESSED_DATA_PATH / "manzent_geom" / f"{comuna}.fgb", driver="FlatGeobuf"
    )
