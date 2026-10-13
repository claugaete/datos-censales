# %% [markdown]
# # Obtención de estadísticas
#
# En este script, utilizamos los datos a nivel de manzana para generar las
# distintas estadísticas que se visualizarán en la aplicación (con distintas
# resoluciones) y se disponibilizarán para su descarga.

# %%
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
from tobler.area_weighted import area_interpolate
from tobler.util import h3fy
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

CENSO_DATA_PATH = DATA_PATH / "interim" / "censo"
STATS_DATA_PATH = DATA_PATH / "processed" / "stats"
DOWNLOAD_DATA_PATH = DATA_PATH / "processed" / "download"

STATS_DATA_PATH.mkdir(exist_ok=True)
DOWNLOAD_DATA_PATH.mkdir(exist_ok=True)

# %% [markdown]
# ## Generación de estadísticas a nivel de manzana

# %%
manzanas = gpd.read_parquet(
    CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Manzanas.parquet"
)
entidades = gpd.read_parquet(
    CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Entidades.parquet"
)

# %%
manzent = pd.concat([manzanas, entidades], ignore_index=True)
manzent = manzent.rename_geometry("geometry").set_index("MANZENT")


# %% [markdown]
# La idea detrás de este script es que, para cada comuna, se generen las
# estadísticas deseadas a nivel de manzana mediante una función que reciba el
# GeoDataFrame correspondiente a la comuna y retorne las estadísticas en un
# DataFrame (sin la información geográfica). Esta función, al ser relativamente
# compleja, debiera ir en su propio archivo y ser importada a este script.
#
# Como ejemplo, guardaremos la siguiente información:
# - Población
# - Densidad (hab/km^2)
# - Número de inmigrantes
# - Porcentaje de inmigrantes
# - Promedio de edad

# %%
# función que recibe el GDF de una comuna y retorna sus estadísticas
def generate_stats(comuna_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    comuna_stats: pd.DataFrame = comuna_gdf[["n_per", "n_inmigrantes", "prom_edad"]]
    comuna_stats["densidad"] = comuna_gdf["n_per"] / (
        comuna_gdf.to_crs(5361).area / 1_000_000
    )
    comuna_stats["pct_inmigrantes"] = comuna_gdf["n_inmigrantes"] / comuna_gdf["n_per"]

    return comuna_stats


# %%
all_comunas: dict[str, gpd.GeoDataFrame] = {}
all_stats: dict[str, pd.DataFrame] = {}

for comuna, comuna_gdf in tqdm(manzent.groupby("COMUNA")):
    all_comunas[comuna] = comuna_gdf
    comuna_stats = generate_stats(comuna_gdf)
    all_stats[comuna] = comuna_stats.assign(COMUNA=comuna)

# %%
all_stats_df = pd.concat(all_stats.values())
all_stats_df.to_csv(STATS_DATA_PATH / "manzent.csv")

# %%
all_stats_df.sample(10)

# %% [markdown]
# ## Generación de estadísticas a nivel de celda H3

# %% [markdown]
# Para el cambio de soporte, necesitamos saber cuáles estadísticas son
# intensivas y cuáles son extensivas.
#
# (Nota: queda pendiente asegurar que las estadísticas mencionadas en las listas
# inferiores efectivamente estén presentes en el DataFrame retornado por
# `generate_stats`, para evitar problemas en ejecución).

# %%
intensive_cols = ["prom_edad", "densidad", "pct_inmigrantes"]
extensive_cols = ["n_per", "n_inmigrantes"]

H3_RESOLUTION_COMUNA = 10

# %%
limites_urbanos = gpd.read_parquet(
    CENSO_DATA_PATH / "Cartografia_censo2024_Pais_Limite_Urbano.parquet"
)

# %% [markdown]
# Para cada comuna, realizamos cambio de soporte a celdas H3 (solamente
# considerando áreas urbanas, para disminuir la cantidad de celdas). Por ahora
# simplemente hacemos *area-weighted interpolation* sin ningún tipo de
# *masking*, pero la idea sería realizar una mejor interpolación a futuro, y
# quizás incluso agregar celdas para zonas rurales (si la cantidad de celdas no
# es excesiva).

# %%
all_stats_h3: dict[str, pd.DataFrame] = {}

for (comuna, comuna_gdf), comuna_stats in tqdm(
    zip(all_comunas.items(), all_stats.values()), total=len(all_comunas)
):
    comuna_stats_gdf = gpd.GeoDataFrame(
        comuna_stats, geometry=comuna_gdf.geometry
    ).to_crs(5361)
    comuna_stats_gdf[extensive_cols] = comuna_stats_gdf[extensive_cols].fillna(0)

    lu = limites_urbanos[limites_urbanos["COMUNA"] == comuna]
    if len(lu) == 0:
        continue

    h3_geoms: gpd.GeoDataFrame = h3fy(
        lu,
        resolution=H3_RESOLUTION_COMUNA,
    ).to_crs(5361)
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="nan values in variable")
        h3_gdf: gpd.GeoDataFrame = area_interpolate(
            source_df=comuna_stats_gdf,
            target_df=h3_geoms,
            extensive_variables=extensive_cols,
            intensive_variables=intensive_cols,
            allocate_total=False,
            fill_nan="median",
        ).assign(COMUNA=comuna)
    all_stats_h3[comuna] = h3_gdf.drop(columns="geometry")

# %%
all_stats_h3_df = pd.concat(all_stats_h3.values())
all_stats_h3_df.to_csv(STATS_DATA_PATH / "h3_comuna.csv")

# %%
all_stats_h3_df.sample(10)
