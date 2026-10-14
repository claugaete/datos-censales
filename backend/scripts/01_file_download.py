# %% [markdown]
# # Descarga de archivos de datos
#
# Este script realiza la descarga de los datos necesarios para la aplicación.

# %% [markdown]
# ## Imports y funciones

# %%
import zipfile
from pathlib import Path

import requests
from tqdm import tqdm

try:
    DATA_PATH = Path(__file__).resolve().parent.parent / "data"
except NameError:
    DATA_PATH = Path("..") / "data"

RAW_DATA_PATH = DATA_PATH / "raw"
INTERIM_DATA_PATH = DATA_PATH / "interim"


# %%
def unzip(zip_path: Path, out_dir: Path):
    """Extrae un ZIP desde `zip_path` a la carpeta `out_dir`."""
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(out_dir)


# %%
def download_file(
    url: str, download_path: Path, chunk_size: int = 8192, **kwargs
):
    """
    Descarga un archivo, mostrando una barra de progreso y creando el
    directorio si es necesario.

    Parameters
    ---
    url : str
        URL desde la cual se desea descargar el archivo.
    download_path : Path
        Ruta en la cual se desea guardar el archivo.
    chunk_size : int, default: 8192
        Número de bytes que se leen a memoria en cada paso (para ir aumentando
        el progreso).
    **kwargs
        Argumentos que serán pasados a la barra de progreso, creada con
        `tqdm.tqdm`.
    """
    
    download_path.parent.mkdir(exist_ok=True)

    response = requests.get(url, stream=True)
    try:
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        print(f"Error descargando {url}: " + str(e))
        return
    file_size = response.headers.get("Content-Length")
    desc = f"Descargando {Path(download_path).name}"
    if file_size is None:
        progress_bar = tqdm(unit="B", unit_scale=True, desc=desc, **kwargs)
    else:
        progress_bar = tqdm(
            unit="B",
            unit_scale=True,
            total=int(file_size),
            desc=desc,
            **kwargs,
        )

    with open(download_path, mode="wb") as file:
        for chunk in response.iter_content(chunk_size=chunk_size):
            file.write(chunk)
            progress_bar.update(len(chunk))

    progress_bar.close()



# %% [markdown]
# ## Cartografía censal

# %%
download_file(
    "https://storage.googleapis.com/bktdescargascenso2024/Cartografia/GEOPARQUET/Cartografia_censo2024_Pais.zip",
    RAW_DATA_PATH / "Cartografia.zip",
)

# %%
unzip(RAW_DATA_PATH / "Cartografia.zip", INTERIM_DATA_PATH / "censo")
