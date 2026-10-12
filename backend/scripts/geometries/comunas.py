# %% [markdown]
# # Generación de MBTiles para comunas
#
# Este notebook contiene la generación del archivo MBTiles para mostrar las
# comunas de Chile con distintos niveles de resolución.

# %%
import subprocess
from pathlib import Path

import geopandas as gpd

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / ".." / "data"

INTERIM_DATA_PATH = DATA_PATH / "interim"
PROCESSED_DATA_PATH = DATA_PATH / "processed"

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
comunas.to_file(INTERIM_DATA_PATH / "comunas.geojsonl")

# %%
subprocess.run(
    [
        "tippecanoe",
        "-zg",
        "-o",
        PROCESSED_DATA_PATH / "comunas.mbtiles",
        INTERIM_DATA_PATH / "comunas.geojsonl",
    ],
    check=True,
)
