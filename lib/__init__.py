# Makes 'lib' a Python package so 'uvicorn lib.api:app' works.
from . import ocr  # optional re-export
__all__ = ["ocr"]
