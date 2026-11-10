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

def read_options(mask, options):
    ratios = {}
    for opt in options:
        cx, cy = round(opt['x'] * SCALE), round(opt['y'] * SCALE)
        ring = opt.get('sample') == 'ring'
        radius = max(2, round(opt['radius'] * SCALE * (.85 if ring else .65)))
        yy, xx = np.ogrid[-radius:radius+1, -radius:radius+1]
        circle = xx*xx + yy*yy <= radius*radius
        if ring:
            circle &= xx*xx + yy*yy >= (opt['radius'] * SCALE * .65)**2
        roi = mask[cy-radius:cy+radius+1, cx-radius:cx+radius+1]
        if roi.shape != circle.shape or not np.any(circle):
            raise ValueError('Hay círculos fuera del área de lectura.')
        ratios[opt['option']] = round(float(np.mean(roi[circle] > 0)), 4)
    marked = [o for o, density in ratios.items() if density >= .50]
    uncertain = [o for o, density in ratios.items() if .12 < density < .50]
    state = 'multiple' if len(marked) > 1 else 'uncertain' if uncertain else 'single' if marked else 'blank'
    return {'status': state, 'options': marked, 'densities': ratios}

def read_fill_options(gray, options, kernel_ratio, marked_density, review_density, method):
    """Measure interior fill using local paper contrast and configurable opening.

    The old narrow annulus missed centered pencil marks. A local paper estimate
    retains grayscale pencil strokes; opening removes the thin printed numeral
    and outline before measuring the inner disk. A softer channel only raises a
    review flag, never chooses an identity. Coordinates and printed sheets stay valid.
    """
    firm, soft = {}, {}
    for opt in options:
        cx, cy = round(opt['x'] * SCALE), round(opt['y'] * SCALE)
        radius = opt['radius'] * SCALE
        pad = int(np.ceil(radius * 1.35))
        roi = gray[cy-pad:cy+pad+1, cx-pad:cx+pad+1]
        if roi.shape != (2*pad+1, 2*pad+1):
            raise ValueError('Hay círculos fuera del área de lectura.')
        yy, xx = np.ogrid[-pad:pad+1, -pad:pad+1]
        distance = xx*xx + yy*yy
        interior = distance <= (radius * .80)**2
        paper = (distance >= (radius * 1.10)**2) & (distance <= (radius * 1.35)**2)
        background = float(np.percentile(roi[paper], 90))
        deficit = background - roi.astype(np.float32)
        # Larger kernels remove the identity glyphs; smaller kernels preserve
        # partial answer strokes while removing isolated printing/scanning noise.
        kernel_radius = max(1, round(radius * kernel_ratio))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*kernel_radius+1, 2*kernel_radius+1))
        values = []
        for threshold in (max(18, background * .08), max(10, background * .04)):
            ink = (deficit >= threshold).astype(np.uint8) * 255
            broad_ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, kernel)
            values.append(round(float(np.mean(broad_ink[interior] > 0)), 4))
        firm[opt['option']], soft[opt['option']] = values
    marked = [option for option, density in firm.items() if density >= marked_density]
    uncertain = [option for option, density in soft.items() if density > review_density and option not in marked]
    state = 'multiple' if len(marked) > 1 else 'uncertain' if uncertain else 'single' if marked else 'blank'
    return {'status': state, 'options': marked, 'densities': firm, 'softDensities': soft, 'method': method}

def read_identity_options(gray, options):
    # Preserve the calibrated code/area classifier and printed sheet geometry.
    return read_fill_options(gray, options, .40, .50, .12, 'interior-fill-v1')

def read_answer_options(gray, options):
    # A speck is not a response. Require substantial interior fill for an
    # automatic answer, but keep meaningful partial/faint marks in review.
    return read_fill_options(gray, options, .14, .60, .30, 'answer-fill-v2')

def split_cartillas(image):
    """Find separate marker rectangles on imposed A4s; never mix their corners."""
    detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50))
    corners, ids, _ = detector.detectMarkers(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
    if ids is None or max(list(ids.flatten()).count(i) for i in range(4)) <= 1:
        return [image], False
    tags = [(int(i), c[0], np.mean(c[0], axis=0)) for c, i in zip(corners, ids.flatten()) if int(i) in range(4)]
    used, crops = set(), []
    for anchor, (identifier, points, center) in enumerate(tags):
        if identifier != 0:
            continue
        right = points[1] - points[0]; right /= np.linalg.norm(right)
        down = points[3] - points[0]; down /= np.linalg.norm(down)
        def nearest(kind, axis):
            choices = []
            for index, (code, _, pos) in enumerate(tags):
                vector = pos - center; along = float(np.dot(vector, axis))
                across = abs(float(vector[0]*axis[1] - vector[1]*axis[0]))
                if code == kind and index not in used and along > 0 and across < along * .4:
                    choices.append((np.linalg.norm(vector), index))
            return min(choices)[1] if choices else None
        top_right, bottom_left = nearest(1, right), nearest(3, down)
        if top_right is None or bottom_left is None:
            continue
        predicted = tags[top_right][2] + tags[bottom_left][2] - center
        candidates = [(np.linalg.norm(pos-predicted), i) for i, (code, _, pos) in enumerate(tags) if code == 2 and i not in used]
        if not candidates:
            continue
        distance, bottom_right = min(candidates)
        if distance > .35 * min(np.linalg.norm(tags[top_right][2]-center), np.linalg.norm(tags[bottom_left][2]-center)):
            continue
        selected = [anchor, top_right, bottom_right, bottom_left]
        polygon = np.float32([tags[i][2] for i in selected])
        if not cv2.isContourConvex(polygon):
            continue
        if any(cv2.pointPolygonTest(polygon, tuple(map(float, pos)), False) >= 0 for i, (_, _, pos) in enumerate(tags) if i not in selected):
            continue
        hull = cv2.convexHull(np.concatenate([tags[i][1] for i in selected])).reshape(-1,2)
        x,y,w,h = cv2.boundingRect(hull)
        pad = 12; x0,y0 = max(0,x-pad),max(0,y-pad); x1,y1 = min(image.shape[1],x+w+pad),min(image.shape[0],y+h+pad)
        crop = image[y0:y1,x0:x1].copy()
        mask = np.zeros(crop.shape[:2], np.uint8)
        cv2.fillConvexPoly(mask, np.round(hull-[x0,y0]).astype(np.int32), 255)
        mask = cv2.dilate(mask, np.ones((7,7), np.uint8))
        crop[mask == 0] = 255
        crops.append(crop); used.update(selected)
    return crops, len(used) != len(tags)

def read_page(image, layouts, output):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50))
    corners, ids, _ = detector.detectMarkers(gray)
    if ids is None:
        raise ValueError('No se reconocieron los marcadores. Usa una cartilla generada por la app y evita recortar las esquinas.')
    detected = list(map(int, ids.flatten()))
    if any(detected.count(i) > 1 for i in range(4)):
        raise ValueError('Se detectaron marcadores repetidos. Escanea una sola cartilla por página.')
    centers = {int(i): np.mean(c[0], axis=0) for c, i in zip(corners, ids.flatten())}
    if not all(i in centers for i in range(4)):
        raise ValueError('Deben verse los cuatro marcadores de la cartilla.')
    src = np.float32([centers[i] for i in range(4)])
    normalized = layout = qr = None
    for version in dict.fromkeys(l.get('version', 2) for l in layouts):
        base = next(l for l in layouts if l.get('version', 2) == version)
        dst = np.float32([[m['x'] * SCALE, m['y'] * SCALE] for m in base['markers']])
        matrix = cv2.getPerspectiveTransform(src, dst)
        candidate = cv2.warpPerspective(gray, matrix, (round(base['width'] * SCALE), round(base['height'] * SCALE)), borderValue=255)
        value = read_qr(candidate, base)
        if not value or not value.startswith(f'v{version}:'):
            continue
        try:
            page = int(value.split(':')[2])
            layout = next(l for l in layouts if l['page'] == page and l.get('version', 2) == version)
        except (ValueError, IndexError, StopIteration):
            continue
        normalized, qr = candidate, value
        break
    if normalized is None:
        raise ValueError('No se pudo reconocer el QR y formato. Conserva todos los marcadores y usa una imagen nítida.')
    responses = {str(bubble['question']): read_answer_options(normalized, bubble['options']) for bubble in layout['bubbles']}
    identification = None
    if layout.get('identification'):
        spec = layout['identification']
        columns = [read_identity_options(normalized, column['options']) for column in spec['columns']]
        area = read_identity_options(normalized, spec['areas']) if spec['areas'] else None
        identification = {
            'columns': columns,
            'code': ''.join(c['options'][0] for c in columns) if all(c['status'] == 'single' for c in columns) else '',
            'area': spec.get('defaultArea') or (area['options'][0] if area and area['status'] == 'single' else ''),
            'areaReading': area,
        }
    cv2.imwrite(str(output), normalized)
    return {'qr': qr, 'page': page, 'layoutVersion': layout.get('version', 2), 'identification': identification, 'responses': responses, 'imagePath': str(output)}

def main(request):
    result = []
    output_dir = Path(request['outputDir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    for file in request['files']:
        try:
            for image in images(file['path']):
                crops, incomplete = split_cartillas(image)
                for crop in crops:
                    if len(result) >= MAX_PAGES:
                        raise ValueError('El lote supera las 100 caras de cartilla.')
                    try:
                        result.append({**read_page(crop, request['layouts'], output_dir / f'{len(result)}.png'), 'file': file['name']})
                    except Exception as error:
                        result.append({'file': file['name'], 'error': str(error)})
                if incomplete:
                    result.append({'file': file['name'], 'error': 'Hay marcadores sin una cartilla completa. Recorta o fotografía esa cartilla y repite la lectura.'})
        except Exception as error:
            result.append({'file': file['name'], 'error': str(error)})
    return {'pages': result}

if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as handle:
        request = json.load(handle)
    print(json.dumps(main(request)))
