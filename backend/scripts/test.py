# %%
import pandas as pd

# %%
df_all = pd.DataFrame(
    {"id": [0, 1], "poblacion": [1000, 2000], "area": [0.3, 0.1]}
).set_index("id")
df_X = pd.DataFrame({"id": [0, 1], "conteo": [500, 600], "densidad": [0.2, 0.3]}).set_index("id")
df_Y = pd.DataFrame({"id": [0, 1], "conteo": [700, 400], "densidad": [0.2, 0.3]}).set_index("id")

# %%
df_X.columns = pd.MultiIndex.from_arrays([["X"]*len(df_X.columns), df_X.columns])
df_Y.columns = pd.MultiIndex.from_arrays([["Y"]*len(df_Y.columns), df_Y.columns])

# %%
df = pd.concat([df_all, df_X, df_Y], axis=1)

# %%
df_Y.to_dict(orient="index")

# %%
df_all["X"] = df_all.index.map(df_X.to_dict(orient="index"))
df_all["Y"] = df_all.index.map(df_Y.to_dict(orient="index"))

# %%
df_all

# %%
print(df_all.to_json(orient="records"))
