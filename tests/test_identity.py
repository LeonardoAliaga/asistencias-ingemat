"""Regressions on code/area labels rasterized from actual PDFKit booklet PDFs."""
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
 for(const profile of ['letters','digits','single']){
 const def=structuredClone(definition);
 if(profile==='digits')def.areas=def.areas.map((a,i)=>({...a,code:String(i+1)}));
 if(profile==='single')def.areas=[{...def.areas[0],code:'GENERAL'}];
 const name=format+(profile==='letters'?'':'-'+profile);
 const data=await makePDF({id:'identity-test',titulo:'PRUEBA SINTÉTICA',ciclo:'ANUAL',estado:'listo',revision:1,definition:def},[],{mode:'blank',count:1,format});
 fs.writeFileSync(path.join(process.argv[1],name+'.pdf'),data);
 fs.writeFileSync(path.join(process.argv[1],name+'.json'),JSON.stringify(bookletLayouts(def,format)));
}}require('./src/database/db').close()})().catch(error=>{console.error(error);process.exit(1)});'''
        subprocess.run(['node', '-e', script, str(cls.root)], cwd=ROOT, env=env, check=True, capture_output=True)
        cls.cases, cls.area_cases, cls.fixed_cases = {}, {}, {}
        for name in [format+suffix for format in ['quarter-duplex', 'half-single'] for suffix in ['', '-digits', '-single']]:
            layouts = json.loads((cls.root/(name+'.json')).read_text())
            physical = next(reader.images(cls.root/(name+'.pdf')))
            crop = reader.split_cartillas(physical)[0][0]
            target = cls.root/(name+'.png')
            reader.read_page(crop, layouts, target)
            case = (cv2.imread(str(target), 0), layouts)
            if name.endswith('-single-single') or name.endswith('-duplex-single'):
                cls.fixed_cases[name] = case
            else:
                cls.area_cases[name] = case
                if not name.endswith('-digits'):
                    cls.cases[name] = case

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

    def mark_area(self, image, layout, area, shade=120, fraction=.65, offset=(0, 0)):
        opt = next(o for o in layout['identification']['areas'] if o['option']==area)
        center = (round(opt['x']*reader.SCALE)+offset[0], round(opt['y']*reader.SCALE)+offset[1])
        ink = np.full_like(image, 255)
        cv2.circle(ink, center, round(opt['radius']*reader.SCALE*fraction), shade, -1)
        np.minimum(image, ink, out=image)

    def test_empty_printed_area_letters_and_digits_never_select_a_profile(self):
        for name,(blank,layouts) in self.area_cases.items():
            with self.subTest(format=name):
                result=self.read(blank,layouts)
                self.assertEqual(result['area'],'')
                self.assertEqual(result['areaReading']['status'],'blank')

    def test_centered_area_marks_missed_by_old_annulus_select_each_profile(self):
        for name,(blank,layouts) in self.area_cases.items():
            for opt in layouts[0]['identification']['areas']:
                with self.subTest(format=name,area=opt['option']):
                    image=blank.copy()
                    self.mark_area(image,layouts[0],opt['option'])
                    mask=cv2.adaptiveThreshold(image,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,51,15)
                    old=reader.read_options(mask,layouts[0]['identification']['areas'])
                    self.assertNotEqual(old['status'],'single')
                    result=self.read(image,layouts)
                    self.assertEqual(result['area'],opt['option'])
                    self.assertEqual(result['areaReading']['status'],'single')
                    self.assertEqual(result['areaReading']['method'],'interior-fill-v1')

    def test_area_gray_pencil_offsets_jpeg_and_paper_shading(self):
        for name,(blank,layouts) in self.area_cases.items():
            for shade in [80,170,220]:
                for opt in layouts[0]['identification']['areas']:
                    with self.subTest(format=name,shade=shade,area=opt['option']):
                        image=blank.copy()
                        self.mark_area(image,layouts[0],opt['option'],shade=shade,offset=(2,-1))
                        gradient=np.linspace(.78,.96,image.shape[1],dtype=np.float32)[None,:]
                        image=np.rint(image*gradient).astype(np.uint8)
                        ok,jpeg=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,90]);self.assertTrue(ok)
                        self.assertEqual(self.read(cv2.imdecode(jpeg,cv2.IMREAD_GRAYSCALE),layouts)['area'],opt['option'])

    def test_area_print_spread_does_not_turn_letters_into_marks(self):
        for name,(blank,layouts) in self.area_cases.items():
            with self.subTest(format=name):
                image=blank.copy()
                thicker=cv2.erode(blank,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
                for o in layouts[0]['identification']['areas']:
                    pad=round(o['radius']*reader.SCALE*1.4)
                    cx,cy=round(o['x']*reader.SCALE),round(o['y']*reader.SCALE)
                    image[cy-pad:cy+pad+1,cx-pad:cx+pad+1]=thicker[cy-pad:cy+pad+1,cx-pad:cx+pad+1]
                result=self.read(image,layouts)
                self.assertEqual(result['area'],'')
                self.assertEqual(result['areaReading']['status'],'blank')

    def test_multiple_or_faint_competing_areas_block_profile_selection(self):
        for name,(blank,layouts) in self.area_cases.items():
            options=layouts[0]['identification']['areas']
            for shade,state in [(120,'multiple'),(242,'uncertain')]:
                with self.subTest(format=name,state=state):
                    image=blank.copy()
                    self.mark_area(image,layouts[0],options[0]['option'])
                    self.mark_area(image,layouts[0],options[-1]['option'],shade=shade)
                    result=self.read(image,layouts)
                    self.assertEqual(result['area'],'')
                    self.assertEqual(result['areaReading']['status'],state)

    def test_missing_or_faint_area_is_not_guessed_from_a_complete_student_code(self):
        for name,(blank,layouts) in self.area_cases.items():
            for faint in [False,True]:
                with self.subTest(format=name,faint=faint):
                    image=blank.copy()
                    for column,digit in enumerate('00123456'):
                        self.mark(image,layouts[0],column,digit)
                    if faint:self.mark_area(image,layouts[0],layouts[0]['identification']['areas'][0]['option'],shade=242)
                    result=self.read(image,layouts)
                    self.assertEqual(result['code'],'00123456')
                    self.assertEqual(result['area'],'')
                    self.assertEqual(result['areaReading']['status'],'uncertain' if faint else 'blank')

    def test_single_fixed_profile_needs_no_area_mark(self):
        self.assertEqual(len(self.fixed_cases),2)
        for name,(blank,layouts) in self.fixed_cases.items():
            with self.subTest(format=name):
                result=self.read(blank,layouts)
                self.assertEqual(result['area'],'GENERAL')
                self.assertIsNone(result['areaReading'])

    def mark_answer(self, image, opt, fraction, shade=100, offset=(0,0)):
        ink=np.full_like(image,255)
        center=(round(opt['x']*reader.SCALE)+offset[0],round(opt['y']*reader.SCALE)+offset[1])
        cv2.circle(ink,center,round(opt['radius']*reader.SCALE*fraction),shade,-1)
        np.minimum(image,ink,out=image)

    def answer(self, image, layouts, question):
        return reader.read_page(cv2.cvtColor(image,cv2.COLOR_GRAY2BGR),layouts,self.root/'answers.png')['responses'][str(question)]

    def test_answer_small_dots_are_ignored_instead_of_marked_or_flagged(self):
        for name,(blank,layouts) in self.cases.items():
            # Actual unlabeled answer circles from the PDF, both sides/formats.
            for page in layouts:
                # The back has its own QR; the normalized fixture is front-only.
                if page['page']!=1:continue
                bubble=page['bubbles'][0]
                for fraction in [.10,.20,.30,.35]:
                    with self.subTest(format=name,fraction=fraction):
                        image=blank.copy()
                        for opt in bubble['options']:
                            self.mark_answer(image,opt,fraction)
                        result=self.answer(image,layouts,bubble['question'])
                        self.assertEqual(result['status'],'blank')
                        self.assertEqual(result['options'],[])

    def test_answer_clear_centered_gray_fills_read_all_options(self):
        for name,(blank,layouts) in self.cases.items():
            for bubble in [layouts[0]['bubbles'][0],layouts[0]['bubbles'][-1]]:
                for opt in bubble['options']:
                    for shade in [80,170,220]:
                        with self.subTest(format=name,question=bubble['question'],option=opt['option'],shade=shade):
                            image=blank.copy()
                            self.mark_answer(image,opt,.70,shade=shade,offset=(1,-1))
                            ok,jpeg=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,90]);self.assertTrue(ok)
                            result=self.answer(cv2.imdecode(jpeg,cv2.IMREAD_GRAYSCALE),layouts,bubble['question'])
                            self.assertEqual((result['status'],result['options']),('single',[opt['option']]))

    def test_answer_a_dot_beside_a_full_answer_does_not_create_false_double_mark(self):
        for name,(blank,layouts) in self.cases.items():
            image=blank.copy();bubble=layouts[0]['bubbles'][0]
            self.mark_answer(image,bubble['options'][1],.85)
            self.mark_answer(image,bubble['options'][3],.30)
            result=self.answer(image,layouts,bubble['question'])
            self.assertEqual((result['status'],result['options']),('single',['B']))

    def test_answer_meaningful_partial_and_faint_marks_still_require_review(self):
        for name,(blank,layouts) in self.cases.items():
            for fraction,shade in [(.50,100),(.85,242)]:
                image=blank.copy();bubble=layouts[0]['bubbles'][0]
                self.mark_answer(image,bubble['options'][0],fraction,shade=shade)
                result=self.answer(image,layouts,bubble['question'])
                self.assertEqual(result['status'],'uncertain')
                self.assertEqual(result['options'],[])

    def test_answer_two_real_fills_stay_multiple_and_partial_competitor_stays_uncertain(self):
        for name,(blank,layouts) in self.cases.items():
            for fraction,state in [(.85,'multiple'),(.50,'uncertain')]:
                image=blank.copy();bubble=layouts[0]['bubbles'][0]
                self.mark_answer(image,bubble['options'][0],.85)
                self.mark_answer(image,bubble['options'][4],fraction)
                result=self.answer(image,layouts,bubble['question'])
                self.assertEqual(result['status'],state)
