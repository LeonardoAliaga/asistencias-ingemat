import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('reader',ROOT/'src/omr/reader.py')
reader=importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

def layouts(n):
    return json.loads(subprocess.check_output(['node','-e',f'console.log(JSON.stringify(require("./src/services/omr-layout").layouts({n})))'],cwd=ROOT,text=True))

def sheet(layout,marks=None):
    scale=reader.SCALE
    image=np.full((round(layout['height']*scale),round(layout['width']*scale),3),255,dtype=np.uint8)
    dictionary=cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    for marker in layout['markers']:
        size=round(marker['size']*scale)
        tag=cv2.aruco.generateImageMarker(dictionary,marker['id'],size)
        x=round(marker['x']*scale-size/2);y=round(marker['y']*scale-size/2)
        image[y:y+size,x:x+size]=cv2.cvtColor(tag,cv2.COLOR_GRAY2BGR)
    payload=f'v2:00000000-0000-4000-8000-000000000000:{layout["page"]}:abcdef012345abcdef012345'
    qr=cv2.QRCodeEncoder_create().encode(payload)
    qr=cv2.copyMakeBorder(qr,4,4,4,4,cv2.BORDER_CONSTANT,value=255)
    size=round(layout['qr']['size']*scale)
    qr=cv2.resize(qr,(size,size),interpolation=cv2.INTER_NEAREST)
    x,y=round(layout['qr']['x']*scale),round(layout['qr']['y']*scale)
    image[y:y+size,x:x+size]=cv2.cvtColor(qr,cv2.COLOR_GRAY2BGR)
    for bubble in layout['bubbles']:
        for opt in bubble['options']:
            center=(round(opt['x']*scale),round(opt['y']*scale));radius=round(opt['radius']*scale)
            cv2.circle(image,center,radius,(80,80,80),2)
            if opt['option'] in (marks or {}).get(bubble['question'],[]):cv2.circle(image,center,radius-2,(0,0,0),-1)
    return image

class OMRTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.layouts=layouts(120)
    def setUp(self):self.tmp=tempfile.TemporaryDirectory()
    def tearDown(self):self.tmp.cleanup()
    def read(self,image,layout=None):return reader.read_page(image,layout or self.layouts,Path(self.tmp.name)/'normalized.png')
    def test_120_single_marks(self):
        marks={q:['ABCDE'[(q-1)%5]] for q in range(1,121)}
        result=self.read(sheet(self.layouts[0],marks))
        self.assertEqual(len(result['responses']),120)
        for q,r in result['responses'].items():self.assertEqual((r['status'],r['options']),('single',marks[int(q)]))
    def test_blanks_and_double_marks(self):
        result=self.read(sheet(self.layouts[0],{1:['A','B']}))
        self.assertEqual(result['responses']['1']['status'],'multiple')
        self.assertEqual(result['responses']['2']['status'],'blank')
    def test_rotation_and_perspective(self):
        image=sheet(self.layouts[0],{1:['A'],120:['E']});h,w=image.shape[:2]
        matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[w,0],[w,h],[0,h]]),np.float32([[45,40],[w-70,15],[w-20,h-30],[20,h-75]]))
        skewed=cv2.warpPerspective(image,matrix,(w,h),borderValue=(255,255,255))
        result=self.read(np.rot90(skewed).copy())
        self.assertEqual(result['responses']['1']['options'],['A'])
        self.assertEqual(result['responses']['120']['options'],['E'])
    def test_partial_mark_is_uncertain(self):
        image=sheet(self.layouts[0]);opt=self.layouts[0]['bubbles'][0]['options'][0]
        center=(round(opt['x']*reader.SCALE),round(opt['y']*reader.SCALE))
        cv2.circle(image,center,round(opt['radius']*reader.SCALE*.5),(0,0,0),-1)
        self.assertEqual(self.read(image)['responses']['1']['status'],'uncertain')
    def test_missing_marker_is_rejected(self):
        image=sheet(self.layouts[0]);image[40:210,40:210]=255
        with self.assertRaises(ValueError):self.read(image)
    def test_duplicate_marker_is_rejected(self):
        image=sheet(self.layouts[0]);size=125
        tag=cv2.aruco.generateImageMarker(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50),0,size)
        image[650:650+size,1650:1650+size]=cv2.cvtColor(tag,cv2.COLOR_GRAY2BGR)
        with self.assertRaisesRegex(ValueError,'repetidos'):self.read(image)
    def test_second_page_for_200_questions(self):
        config=layouts(200)
        result=self.read(sheet(config[1],{121:['C'],200:['B']}),config)
        self.assertEqual(result['page'],2)
        self.assertEqual(len(result['responses']),80)
        self.assertEqual(result['responses']['200']['options'],['B'])
    def test_opencv_fallback_when_primary_decoder_cannot_read(self):
        with mock.patch.object(reader.zxingcpp, 'read_barcodes', return_value=[]):
            result=self.read(sheet(self.layouts[0],{1:['C']}))
        self.assertEqual(result['responses']['1']['options'],['C'])
    def test_actual_pdf_from_node_generator(self):
        directory=Path(self.tmp.name);env={**os.environ,'DATA_DIR':str(directory/'data'),'DISABLE_MIGRATION_BACKUP':'1','SESSION_SECRET':'synthetic-omr-regression-test-secret-only-2026'}
        code='''const fs=require('fs');const qrcode=require('qrcode');const encode=qrcode.toBuffer;let mask=0;qrcode.toBuffer=(value,opts)=>encode(value,{...opts,maskPattern:mask++%8});const {makePDF}=require('./src/services/omr-pdf.service');const {normalizeDefinition}=require('./src/services/grading.service');const def=normalizeDefinition({totalQuestions:120,keys:Object.fromEntries(Array.from({length:120},(_,i)=>[i+1,'A']))});makePDF({id:'pdf-test',titulo:'SIMULACRO SINTETICO',ciclo:'ANUAL',estado:'listo',revision:1,definition:def},Array.from({length:32},(_,i)=>({codigo:'DEMO'+i,nombre:'DEMO',apellido:'ALUMNO',area:'GENERAL'}))).then(bytes=>{fs.writeFileSync(process.argv[1],bytes);require('./src/database/db').close();}).catch(e=>{console.error(e);process.exit(1)});'''
        filename=directory/'cartilla.pdf'
        subprocess.run(['node','-e',code,str(filename)],cwd=ROOT,env=env,check=True,capture_output=True)
        count=0
        for image in reader.images(filename):
            count+=1
            result=self.read(image);self.assertEqual(len(result['responses']),120)
            self.assertTrue(all(r['status']=='blank' for r in result['responses'].values()))
        self.assertEqual(count,32)

if __name__=='__main__':unittest.main()
