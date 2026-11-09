"""Read marks only. Academic rules and grades belong to the Node grading service."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
import zxingcpp
from PIL import Image, ImageOps
import pypdfium2 as pdfium

SCALE = 300 / 72
MAX_PAGES = 100
MAX_PIXELS = 30_000_000

def images(filename):
    path = Path(filename)
    if path.suffix.lower() == '.pdf':
        pdf = pdfium.PdfDocument(str(path))
        try:
            if len(pdf) > MAX_PAGES:
                raise ValueError('El PDF supera las 100 páginas.')
            for i in range(len(pdf)):
                page = pdf[i]
                try:
                    w, h = page.get_size()
                    if w * h * SCALE * SCALE > MAX_PIXELS:
                        raise ValueError('La página PDF tiene dimensiones excesivas.')
                    bitmap = page.render(scale=SCALE)
                    try:
                        rgb = np.asarray(bitmap.to_pil().convert('RGB'))
                        yield cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                    finally:
                        bitmap.close()
                finally:
                    page.close()
        finally:
            pdf.close()
    else:
        with Image.open(path) as source:
            if source.width * source.height > MAX_PIXELS:
                raise ValueError('La imagen supera los 30 megapíxeles.')
            rgb = np.asarray(ImageOps.exif_transpose(source).convert('RGB'))
        yield cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

def read_qr(normalized, layout):
    # The quiet area and location are shared with the printer. Cropping avoids
    # distracting text/markers and downsampling gives the detector a second scale.
    qr_box = layout.get('qr', {'x': 700, 'y': 47, 'size': 82})
    pad = 8
    x1, y1 = round((qr_box['x']-pad)*SCALE), round((qr_box['y']-pad)*SCALE)
    x2, y2 = round((qr_box['x']+qr_box['size']+pad)*SCALE), round((qr_box['y']+qr_box['size']+pad)*SCALE)
    crop = normalized[y1:y2, x1:x2]
    # Independent QR decoding avoids OpenCV's intermittent failures on valid
    # QR masks. Identity and signature are still verified by Node afterwards.
    values = {barcode.text for barcode in zxingcpp.read_barcodes(
        crop, formats=zxingcpp.BarcodeFormat.QRCode,
    ) if barcode.valid}
    if len(values) == 1:
        return values.pop()
    if len(values) > 1:
        return ''
    detector = cv2.QRCodeDetector()
    candidates = [crop, cv2.resize(crop, None, fx=.75, fy=.75, interpolation=cv2.INTER_AREA)]
    candidates.append(cv2.threshold(crop,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1])
    candidates.append(normalized)
    for candidate in candidates:
        value, _, _ = detector.detectAndDecode(candidate)
        if value:
            return value
    return ''

def read_page(image, layouts, output):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50))
    corners, ids, _ = detector.detectMarkers(gray)
    if ids is None:
        raise ValueError('No se reconocieron los marcadores. Usa una cartilla v2 y evita recortar las esquinas.')
    detected = list(map(int, ids.flatten()))
    if any(detected.count(i) > 1 for i in range(4)):
        raise ValueError('Se detectaron marcadores repetidos. Escanea una sola cartilla por página.')
    centers = {int(i): np.mean(c[0], axis=0) for c, i in zip(corners, ids.flatten())}
    if not all(i in centers for i in range(4)):
        raise ValueError('Deben verse los cuatro marcadores de la cartilla.')
    base = layouts[0]
    src = np.float32([centers[i] for i in range(4)])
    dst = np.float32([[m['x'] * SCALE, m['y'] * SCALE] for m in base['markers']])
    matrix = cv2.getPerspectiveTransform(src, dst)
    normalized = cv2.warpPerspective(gray, matrix, (round(base['width'] * SCALE), round(base['height'] * SCALE)), borderValue=255)
    qr = read_qr(normalized, base)
    if not qr:
        raise ValueError('No se pudo leer el QR. Repite el escaneo a 300 ppp sin filtros de limpieza.')
    try:
        page = int(qr.split(':')[2])
        layout = next(l for l in layouts if l['page'] == page)
    except (ValueError, IndexError, StopIteration):
        raise ValueError('La página no corresponde al formato de este examen.')
    mask = cv2.adaptiveThreshold(normalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15)
    responses = {}
    for bubble in layout['bubbles']:
        ratios = {}
        for opt in bubble['options']:
            cx, cy = round(opt['x'] * SCALE), round(opt['y'] * SCALE)
            radius = max(2, round(opt['radius'] * SCALE * .65))
            yy, xx = np.ogrid[-radius:radius+1, -radius:radius+1]
            circle = xx*xx + yy*yy <= radius*radius
            roi = mask[cy-radius:cy+radius+1, cx-radius:cx+radius+1]
            ratios[opt['option']] = round(float(np.mean(roi[circle] > 0)), 4)
        marked = [o for o, density in ratios.items() if density >= .50]
        uncertain = [o for o, density in ratios.items() if .12 < density < .50]
        state = 'multiple' if len(marked) > 1 else 'uncertain' if uncertain else 'single' if marked else 'blank'
        responses[str(bubble['question'])] = {'status': state, 'options': marked, 'densities': ratios}
    cv2.imwrite(str(output), normalized)
    return {'qr': qr, 'page': page, 'responses': responses, 'imagePath': str(output)}

def main(request):
    result = []
    output_dir = Path(request['outputDir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    for file in request['files']:
        try:
            for image in images(file['path']):
                if len(result) >= MAX_PAGES:
                    raise ValueError('El lote supera las 100 páginas.')
                try:
                    result.append({**read_page(image, request['layouts'], output_dir / f'{len(result)}.png'), 'file': file['name']})
                except Exception as error:
                    result.append({'file': file['name'], 'error': str(error)})
        except Exception as error:
            result.append({'file': file['name'], 'error': str(error)})
    return {'pages': result}

if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as handle:
        request = json.load(handle)
    print(json.dumps(main(request)))
