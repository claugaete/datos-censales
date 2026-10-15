# %% [markdown]
# # Obtención de estadísticas
#
# En este script, utilizamos los datos a nivel de manzana para generar las
# distintas estadísticas que se visualizarán en la aplicación (con distintas
# resoluciones) y se disponibilizarán para su descarga.

# %%
from pathlib import Path

import geopandas as gpd
import pandas as pd
from tobler.area_weighted import area_interpolate
from tobler.util import h3fy
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

CENSO_DATA_PATH = DATA_PATH / "interim" / "censo"
STATS_DATA_PATH = DATA_PATH / "processed" / "stats"
DOWNLOAD_DATA_PATH = DATA_PATH / "processed" / "download"

STATS_DATA_PATH.mkdir(exist_ok=True)
DOWNLOAD_DATA_PATH.mkdir(exist_ok=True)

# %% [markdown]
# ## Generación de estadísticas a nivel de manzana

# %% [markdown]
# A nivel de manzana, tendremos dos fuentes de información para las estadísticas:
#
# 1. Los cruces realizados por Vicente, que se encuentran en el directorio
#    `data/processed/stats/cruces`. De aquí se extraerán los conteos filtrados
#    según las variables solicitadas en la aplicación.
# 2. Información del área y población total de cada manzana/entidad, que se
#    extraerá directamente de la cartografía del Censo. (Nota: una vez se
#    privaticen los conteos, ¿será necesario también privatizar la población
#    total obtenida aquí?)

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


# %%
# función que recibe el GDF de una comuna y retorna sus estadísticas (número
# de habitantes y área)
def generate_stats(comuna_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        data={
            "poblacion": comuna_gdf.n_per,
            "area": comuna_gdf.to_crs(5361).area / 1_000_000,
        },
        index=comuna_gdf.index,
    )


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
# ### Obtención de valores posibles para conteos

# %% [markdown]
# Creamos un JSON con las variables y categorías posibles para los conteos (así
# el frontend de la aplicación puede mostrarlas como opciones al usuario).

# %%
conteo_df = pd.read_parquet(
    # usamos la comuna con más filas para asegurar que estén todas las
    # categorías posibles
    STATS_DATA_PATH / "cruces" / "cruces_13201.parquet",
    engine="pyarrow",
)

# %%
possible_values = {}
for var in conteo_df["var1"].drop_duplicates():
    values = conteo_df[conteo_df["var1"] == var]["cat1"].drop_duplicates().to_list()
    possible_values[var] = values

# agregamos la última categoría manualmente porque solo está presente en var2,
# no var1
possible_values["transporte"] = [
    "transporte_auto",
    "transporte_publico",
    "transporte_camina",
    "transporte_bicicleta",
    "transporte_motocicleta",
    "transporte_cab_lan_bote",
    "transporte_otros",
    "resto",
]

# %%
pd.Series(possible_values).to_json(STATS_DATA_PATH / "variables.json")

# %% [markdown]
# ## (BROKEN) Generación de estadísticas a nivel de celda H3

# %%
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

    lu = limites_urbanos[limites_urbanos["COMUNA"] == comuna]
    if len(lu) == 0:
        continue

    h3_geoms: gpd.GeoDataFrame = h3fy(
        lu,
        resolution=H3_RESOLUTION_COMUNA,
    ).to_crs(5361)
    h3_gdf: gpd.GeoDataFrame = area_interpolate(
        source_df=comuna_stats_gdf,
        target_df=h3_geoms,
        extensive_variables=["poblacion"],
        allocate_total=False,
        fill_nan="median",
    ).assign(area=h3_geoms.area / 1_000_000, COMUNA=comuna)
    all_stats_h3[comuna] = h3_gdf.drop(columns="geometry")

# %%
all_stats_h3_df = pd.concat(all_stats_h3.values())
all_stats_h3_df.to_csv(STATS_DATA_PATH / "h3_comuna.csv")

# %%
all_stats_h3_df.sample(10)
