import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = 8784
ORIGIN = f"http://127.0.0.1:{PORT}"


def private_home():
    return Path(os.environ["LOCALAPPDATA"]) / "RDWDW" / "ReportBuilderPilot"
