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
# 1. Los cruces realizados por Vicente, que se deben encontrar en el directorio
#    `data/processed/stats/cruces`. De aquí se extraerán los conteos filtrados
#    según las variables solicitadas en la aplicación.
# 2. Información del área y población total de cada manzana/entidad, que se
#    extraerá directamente de la cartografía del Censo. Al ser poca información,
#    se guardará toda en un único CSV que se mantendrá siempre cargado en el
#    backend de la aplicación web.

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
# ## Generación de estadísticas a nivel de celda H3

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

# %% [markdown]
# ### Área y población por celda

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

# %% [markdown]
# ### Cruces por celda

# %% [markdown]
# Esta sección requiere el uso de GPU. Demoró unos 35 minutos con mi GPU (RTX
# 3060 Mobile).

# %%
import numba_cuda  # noqa: F401, I001
import cudf
import cupyx.scipy.sparse as cpx_sparse
import numpy as np
from scipy.sparse import csr_array
from tobler.area_weighted.area_interpolate import _area_tables_binning

# %%
cuts = limites_urbanos["CUT"].unique()

# %%
for cut in tqdm(cuts):
    # obtenemos datos a nivel de manzent (n_vars filas x n_manzent columnas)
    try:
        conteo_df: cudf.DataFrame = cudf.read_parquet(
            STATS_DATA_PATH / "cruces" / f"cruces_{cut}.parquet",
        )
    except FileNotFoundError:
        continue
    conteo_pivot = conteo_df.pivot(
        index=["var1", "cat1", "var2", "cat2"], columns="MANZENT", values="conteo"
    )
    conteo_vals = conteo_pivot.to_cupy(na_value=0)

    # obtenemos matriz de pesos (n_manzent filas x n_h3 columnas)
    manzent_geoms = (
        manzent.loc[manzent["CUT"] == cut, ["geometry"]]
        .to_crs(5361)
        .reindex(conteo_pivot.columns)
    )
    h3_geoms: gpd.GeoDataFrame = h3fy(
        limites_urbanos[limites_urbanos["CUT"] == cut],
        resolution=H3_RESOLUTION_COMUNA,
    ).to_crs(5361)
    weights: csr_array = _area_tables_binning(manzent_geoms, h3_geoms, "auto")
    # normalizamos pesos (cada manzana se divide por su área total)
    areas = np.repeat(manzent_geoms.area.values, np.diff(weights.indptr))
    np.divide(weights.data, areas, out=weights.data, where=areas != 0)
    weights_gpu = cpx_sparse.csr_matrix(weights)

    # multiplicamos para obtener datos a nivel de celda
    # (n_vars filas x n_h3 columnas)
    conteo_h3 = cudf.DataFrame(
        conteo_vals @ weights_gpu, index=conteo_pivot.index, columns=h3_geoms.index
    )

    # volvemos a la forma original del dataframe y guardamos
    df_melted = conteo_h3.reset_index().melt(
        id_vars=["var1", "cat1", "var2", "cat2"],
        value_vars=conteo_h3.columns[4:],
        var_name="hex_id",
        value_name="conteo",
    )[["h3_index", "var1", "cat1", "var2", "cat2", "conteo"]]
    df_melted.to_pandas().to_parquet(
        STATS_DATA_PATH / "cruces_h3" / f"cruces_{cut}.parquet"
    )
