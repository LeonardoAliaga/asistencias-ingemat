"""Check the exact interpreter and native dependencies used by the OMR worker."""
import importlib
import importlib.metadata
import json
import platform
import struct
import sys
import traceback


def diagnose():
    dependencies = []
    for module_name, package in [
        ("cv2", "opencv-python-headless"),
        ("numpy", "numpy"),
        ("pypdfium2", "pypdfium2"),
        ("PIL", "Pillow"),
        ("zxingcpp", "zxing-cpp"),
    ]:
        item = {"module": module_name, "package": package}
        try:
            module = importlib.import_module(module_name)
            try:
                item["version"] = importlib.metadata.version(package)
            except importlib.metadata.PackageNotFoundError:
                item["version"] = str(getattr(module, "__version__", "desconocida"))
            if module_name == "cv2":
                # Exercise the same native ArUco API as reader.py, not just import.
                module.aruco.ArucoDetector(module.aruco.getPredefinedDictionary(module.aruco.DICT_4X4_50))
                module.QRCodeDetector()
            item["ok"] = True
        except Exception as error:
            item.update(ok=False, error=f"{type(error).__name__}: {error}", traceback=traceback.format_exc())
        dependencies.append(item)
    supported = sys.version_info[:2] >= (3, 11)
    return {
        "ok": supported and all(d["ok"] for d in dependencies),
        "python": {
            "executable": sys.executable,
            "version": sys.version,
            "prefix": sys.prefix,
            "basePrefix": sys.base_prefix,
            "platform": sys.platform,
            "machine": platform.machine(),
            "bits": struct.calcsize("P") * 8,
            "supported": supported,
            "requirement": "Python >=3.11; probado con 3.12",
        },
        "dependencies": dependencies,
    }


if __name__ == "__main__":
    report = diagnose()
    print(json.dumps(report))
    sys.exit(0 if report["ok"] else 1)
