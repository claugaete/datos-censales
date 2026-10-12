# %% [markdown]
# # Generación de geometrías Manzana-Entidad
#
# Este notebook contiene la generación y guardado de las geometrías de las
# manzanas/entidades para cada comuna, que serán utilizadas en las
# visualizaciones web.

# %%
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / ".." / "data"

CENSO_DATA_PATH = DATA_PATH / "interim" / "censo"
MANZENT_GEOM_PATH = DATA_PATH / "processed" / "manzent_geom"
if not MANZENT_GEOM_PATH.exists():
    MANZENT_GEOM_PATH.mkdir()

# %%
manzanas = gpd.read_parquet(
    CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Manzanas.parquet"
)
entidades = gpd.read_parquet(
    CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Entidades.parquet"
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
        MANZENT_GEOM_PATH / f"{comuna}.fgb", driver="FlatGeobuf"
    )
