# Proyecto de datos censales

Cálculo y visualización de datos sintéticos a nivel subcomunal para los
resultados del Censo 2024.

Para construir las imágenes correspondientes al frontend y al backend,
ejecutar uno de los dos comandos siguientes, según se desee construir la
versión de desarrollo o de producción:
```
# dev
docker compose -f docker-compose.dev.yml build

# prod
docker compose -f docker-compose.yml build
```

Para correr el contenedor:
```
# dev
docker compose -f docker-compose.dev.yml up

# prod
docker compose -f docker-compose.yml up
```

Para ejecutar los scripts de descarga y preprocesamiento de datos del backend,
se requiere instalar [`uv`](https://docs.astral.sh/uv/) y ejecutar, en el
directorio `backend`:
```
uv sync --group datagen

uv run scripts/<nombre del script>.py
```

Si se desea, se pueden convertir los scripts a notebooks de Jupyter
ejecutando, en el directorio `backend`:
```
uv run jupytext --sync scripts/*.py
```