"""Regressions on digit labels rasterized from the actual PDFKit booklet PDFs."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('identity_reader', ROOT / 'src/omr/reader.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class IdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        env = {**os.environ, 'DATA_DIR': str(cls.root/'data'), 'DISABLE_MIGRATION_BACKUP': '1'}
        script = r'''const fs=require('node:fs'),path=require('node:path');
const definition=require('./src/services/exam-presets.service').listPresets()[0].definition;
const {makePDF}=require('./src/services/omr-pdf.service');
const {bookletLayouts}=require('./src/services/omr-booklet-layout');
(async()=>{for(const format of ['quarter-duplex','half-single']){
 const data=await makePDF({id:'identity-test',titulo:'PRUEBA SINTÉTICA',ciclo:'ANUAL',estado:'listo',revision:1,definition},[],{mode:'blank',count:1,format});
 fs.writeFileSync(path.join(process.argv[1],format+'.pdf'),data);
 fs.writeFileSync(path.join(process.argv[1],format+'.json'),JSON.stringify(bookletLayouts(definition,format)));
}require('./src/database/db').close()})().catch(error=>{console.error(error);process.exit(1)});'''
        subprocess.run(['node', '-e', script, str(cls.root)], cwd=ROOT, env=env, check=True, capture_output=True)
        cls.cases = {}
        for name in ['quarter-duplex', 'half-single']:
            layouts = json.loads((cls.root/(name+'.json')).read_text())
            physical = next(reader.images(cls.root/(name+'.pdf')))
            crop = reader.split_cartillas(physical)[0][0]
            target = cls.root/(name+'.png')
            reader.read_page(crop, layouts, target)
            cls.cases[name] = (cv2.imread(str(target), 0), layouts)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def mark(self, image, layout, column, digit, shade=120, fraction=.65, offset=(0, 0)):
        opt = layout['identification']['columns'][column]['options'][int(digit)]
        center = (round(opt['x']*reader.SCALE)+offset[0], round(opt['y']*reader.SCALE)+offset[1])
        ink = np.full_like(image, 255)
        cv2.circle(ink, center, round(opt['radius']*reader.SCALE*fraction), shade, -1)
        np.minimum(image, ink, out=image)  # Pencil cannot erase the printed numeral.

    def read(self, image, layouts):
        return reader.read_page(cv2.cvtColor(image, cv2.COLOR_GRAY2BGR), layouts, self.root/'result.png')['identification']

    def test_empty_printed_digits_never_identify_a_student(self):
        for name, (blank, layouts) in self.cases.items():
            with self.subTest(format=name):
                result = self.read(blank, layouts)
                self.assertEqual(result['code'], '')
                self.assertTrue(all(c['status']=='blank' for c in result['columns']))

    def test_centered_marks_that_the_old_annulus_missed_read_every_digit(self):
        for name, (blank, layouts) in self.cases.items():
            for digit in '0123456789':
                with self.subTest(format=name, digit=digit):
                    image = blank.copy()
                    for column in range(8):
                        self.mark(image, layouts[0], column, digit)
                    mask = cv2.adaptiveThreshold(image,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,51,15)
                    old = [reader.read_options(mask,c['options']) for c in layouts[0]['identification']['columns']]
                    self.assertTrue(any(c['status']!='single' or c['options']!=[digit] for c in old))
                    self.assertEqual(self.read(image,layouts)['code'], digit*8)

    def test_leading_zeroes_and_gray_pencil_survive_small_offsets_and_jpeg(self):
        for name, (blank, layouts) in self.cases.items():
            for shade in [80, 170, 220]:
                with self.subTest(format=name, shade=shade):
                    image=blank.copy()
                    for column,digit in enumerate('00123456'):
                        self.mark(image,layouts[0],column,digit,shade=shade,offset=(2,-1))
                    ok,jpeg=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,90]);self.assertTrue(ok)
                    decoded=cv2.imdecode(jpeg,cv2.IMREAD_GRAYSCALE)
                    self.assertEqual(self.read(decoded,layouts)['code'],'00123456')

    def test_paper_shading_and_modest_print_spread_do_not_turn_digits_into_marks(self):
        for name,(blank,layouts) in self.cases.items():
            # One pixel of ink spread simulates a modest increase in print weight.
            thicker=cv2.erode(blank,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
            # Keep the registration markers unchanged: this case isolates the
            # digit printing, while separate tests cover the page registration.
            options=[o for c in layouts[0]['identification']['columns'] for o in c['options']]
            x0=round(min(o['x']-o['radius'] for o in options)*reader.SCALE)-3
            x1=round(max(o['x']+o['radius'] for o in options)*reader.SCALE)+4
            y0=round(min(o['y']-o['radius'] for o in options)*reader.SCALE)-3
            y1=round(max(o['y']+o['radius'] for o in options)*reader.SCALE)+4
            printed=blank.copy();printed[y0:y1,x0:x1]=thicker[y0:y1,x0:x1]
            result=self.read(printed,layouts)
            self.assertEqual(result['code'],'')
            self.assertTrue(all(c['status']=='blank' for c in result['columns']))
            image=blank.copy()
            for column,digit in enumerate('00098765'):
                self.mark(image,layouts[0],column,digit,shade=160)
            gradient=np.linspace(.78,.96,image.shape[1],dtype=np.float32)[None,:]
            image=np.rint(image*gradient).astype(np.uint8)
            self.assertEqual(self.read(image,layouts)['code'],'00098765')

    def test_two_filled_digits_in_one_column_block_identification(self):
        for name,(blank,layouts) in self.cases.items():
            image=blank.copy()
            for column,digit in enumerate('00123456'):
                self.mark(image,layouts[0],column,digit)
            self.mark(image,layouts[0],3,'9')
            result=self.read(image,layouts)
            self.assertEqual(result['code'],'')
            self.assertEqual(result['columns'][3]['status'],'multiple')

    def test_faint_second_mark_is_uncertain_even_beside_a_strong_mark(self):
        for name,(blank,layouts) in self.cases.items():
            image=blank.copy()
            for column,digit in enumerate('00123456'):
                self.mark(image,layouts[0],column,digit)
            self.mark(image,layouts[0],3,'9',shade=242)
            result=self.read(image,layouts)
            self.assertEqual(result['code'],'')
            self.assertEqual(result['columns'][3]['status'],'uncertain')

    def test_faint_or_unfilled_column_is_not_guessed_from_the_other_digits(self):
        for name,(blank,layouts) in self.cases.items():
            for faint in [False,True]:
                image=blank.copy()
                for column,digit in enumerate('00123456'):
                    if column!=5:self.mark(image,layouts[0],column,digit)
                if faint:self.mark(image,layouts[0],5,'4',shade=242)
                result=self.read(image,layouts)
                self.assertEqual(result['code'],'')
                self.assertEqual(result['columns'][5]['status'],'uncertain' if faint else 'blank')
