"""Creates the Daytona snapshot the Code Interpreter runs in (SANDBOX_PROVIDER=daytona).

Usage:
    pip install daytona
    DAYTONA_API_KEY=... python scripts/create-daytona-snapshot.py

Prints the snapshot name to set as DAYTONA_SNAPSHOT in .env.
"""

import os
import sys
import time

from daytona import CreateSnapshotParams, Daytona, DaytonaConfig, Image, Resources

api_key = os.getenv("DAYTONA_API_KEY")
if not api_key:
    sys.exit("DAYTONA_API_KEY is not set")

daytona = Daytona(DaytonaConfig(api_key=api_key))
snapshot_name = f"zetora-analysis:{int(time.time())}"

# Python libraries preinstalled for data analysis and charts.
image = (
    Image.debian_slim("3.12")
    .pip_install(
        [
            "numpy",
            "pandas",
            "matplotlib",
            "scipy",
            "scikit-learn",
            "yfinance",
            "requests",
            "keras",
            "uv",
            "torch",
            "torchvision",
            "torchaudio",
            "plotly",
        ]
    )
    .run_commands(
        "apt-get update && apt-get install -y git",
        "groupadd -r daytona && useradd -r -g daytona -m daytona",
        "mkdir -p /home/daytona/workspace",
    )
)

print(f"Creating snapshot {snapshot_name}...")
daytona.snapshot.create(
    CreateSnapshotParams(
        name=snapshot_name,
        image=image,
        resources=Resources(cpu=2, memory=4, disk=5),
        entrypoint=["sleep", "infinity"],
    ),
    on_logs=print,
)

print(f"\nDone. Set this in .env:\nDAYTONA_SNAPSHOT={snapshot_name}")
