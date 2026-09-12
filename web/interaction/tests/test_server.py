import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

MODULE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('interaction_server',MODULE/'server.py')
server_module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=server_module.Server(('127.0.0.1',0),server_module.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def request(self,path,body=None,headers=None):
        headers=headers or {}
        if body is not None:headers={'Content-Type':'application/json',**headers}
        req=Request(self.base+path,data=body.encode() if body is not None else None,headers=headers)
        try:
            with urlopen(req) as r:return r.status,r.read(),r.headers
        except HTTPError as e:return e.code,e.read(),e.headers
    def test_home_and_modules(self):
        for path in ['/','/web/interaction/app.js','/web/interaction/session.mjs','/web/interaction/style.css']:
            status,data,headers=self.request(path);self.assertEqual(status,200);self.assertTrue(data);self.assertEqual(headers['Cache-Control'],'no-store')
    def test_presets_all_reuse_validator(self):
        status,data,_=self.request('/api/presets');self.assertEqual(status,200)
        items=json.loads(data)['presets'];self.assertEqual(len(items),3)
        for item in items:server_module.validator.validate_output(item['output'],item['input']);self.assertEqual(item['source'],'manual-preset')
    def test_valid_input_not_returned_or_generated(self):
        data=server_module.preset_data()[0]['input'];data['events'][0]['utterance']='TEST_PRIVATE_NOT_ECHOED'
        status,raw,_=self.request('/api/validate-input',json.dumps(data))
        self.assertEqual(status,200);self.assertNotIn(b'TEST_PRIVATE_NOT_ECHOED',raw);self.assertFalse(json.loads(raw)['generated'])
    def test_invalid_input(self):
        for data in ['{}','{"events":NaN}','{"events":[],"events":[]}']:
            self.assertEqual(self.request('/api/validate-input',data)[0],400)
    def test_wrong_event_count(self):
        data=server_module.preset_data()[0]['input'];data['events'].pop()
        self.assertEqual(self.request('/api/validate-input',json.dumps(data))[0],400)
    def test_private_paths_not_served(self):
        for path in ['/AGENTS.md','/web/interaction/server.py','/web/interaction/../../README.md','/web/interaction/%2e%2e/%2e%2e/README.md']:
            self.assertEqual(self.request(path)[0],404)
    def test_no_live_endpoint(self):
        self.assertEqual(self.request('/api/live','{}')[0],404)
    def test_wrong_origin_and_host(self):
        self.assertEqual(self.request('/api/validate-input','{}',{'Origin':'https://other.invalid'})[0],403)
        self.assertEqual(self.request('/',headers={'Host':'other.invalid'})[0],403)
    def test_oversized_payload(self):
        self.assertEqual(self.request('/api/validate-input',' '*17000)[0],413)
    def test_non_json(self):
        self.assertEqual(self.request('/api/validate-input','{}',{'Content-Type':'text/plain'})[0],415)

    def test_decode_without_model_is_labelled(self):
        status,raw,_=self.request('/api/decode',json.dumps({'transcript':'你可以慢慢说。'}))
        self.assertEqual(status,200)
        payload=json.loads(raw)
        self.assertEqual(payload['mode'],'undecoded')
        self.assertIsNone(payload['model'])
        self.assertIn('未配置',payload['notice'])
        self.assertIsNone(payload.get('decode'))
        self.assertEqual(''.join(u['char'] for u in payload['units']),'你可以慢慢说。')
        self.assertEqual(payload['bee']['segmentCount'],7)
        self.assertTrue(payload['trace'])
    def test_decode_never_fabricates_tone_without_model(self):
        _,raw,_=self.request('/api/decode',json.dumps({'transcript':'不要。'}))
        payload=json.loads(raw)
        self.assertNotIn('tone',payload)
        self.assertNotIn('meaning',payload)
        self.assertFalse(payload['decoded'])
    def test_decode_rejects_empty_and_overlong(self):
        self.assertEqual(self.request('/api/decode',json.dumps({'transcript':'   '}))[0],400)
        self.assertEqual(self.request('/api/decode',json.dumps({'transcript':'话'*121}))[0],400)
        self.assertEqual(self.request('/api/decode',json.dumps({'other':1}))[0],400)
    def test_demo_items_are_labelled_manual(self):
        status,raw,_=self.request('/api/demo')
        self.assertEqual(status,200)
        items=json.loads(raw)['items']
        self.assertGreaterEqual(len(items),3)
        for item in items:
            self.assertEqual(item['source'],'manual-placeholder')
            self.assertIn('未调用模型',item['notice'])
            self.assertTrue(item['trace'])
            self.assertEqual(item['bee']['segmentCount'],len(item['units']))
            server_module.decoder.validate_decode(item['decode'])
    def test_demo_items_produce_visibly_different_bees(self):
        items=json.loads(self.request('/api/demo')[1])['items']
        self.assertEqual(len({item['bee']['hue'] for item in items}),len(items))
        self.assertEqual(len({item['bee']['posture'] for item in items}),len(items))
    def test_transcribe_capability_is_honest(self):
        status,raw,_=self.request('/api/transcribe')
        self.assertEqual(status,200)
        payload=json.loads(raw)
        self.assertFalse(payload['available'])
        self.assertIn('未接入',payload['notice'])
    def test_transcribe_post_is_refused_and_stores_nothing(self):
        status,raw,_=self.request('/api/transcribe',json.dumps({'audio':'FAKE_AUDIO_PAYLOAD'}))
        self.assertEqual(status,501)
        payload=json.loads(raw)
        self.assertFalse(payload['available'])
        self.assertNotIn('FAKE_AUDIO_PAYLOAD',raw.decode('utf-8'))
        self.assertNotIn('FAKE_AUDIO_PAYLOAD',json.dumps(payload,ensure_ascii=False))
    def test_decode_with_model_is_wired_to_live(self):
        canned=server_module.decoder.nesting.read(server_module.decoder.PLACEHOLDER)
        original_key,original_run=server_module.MODEL_KEY,server_module.decoder.run_live
        server_module.MODEL_KEY='test-key-not-echoed'
        server_module.decoder.run_live=lambda transcript,endpoint,model,key: {'decode':canned,'model_returned':'deepseek-flash','elapsed_seconds':0.5,'attempts':1}
        try:
            status,raw,_=self.request('/api/decode',json.dumps({'transcript':'你不要给别人添麻烦。'}))
        finally:
            server_module.MODEL_KEY=original_key;server_module.decoder.run_live=original_run
        self.assertEqual(status,200)
        payload=json.loads(raw)
        self.assertEqual(payload['mode'],'live')
        self.assertEqual(payload['model'],server_module.MODEL_NAME)
        self.assertEqual(payload['decode']['tone']['label'],'压抑')
        self.assertEqual(payload['bee']['segmentCount'],10)
        self.assertNotIn('test-key-not-echoed',raw.decode('utf-8'))
    def test_decode_reports_model_failure_without_faking_result(self):
        original_key,original_run=server_module.MODEL_KEY,server_module.decoder.run_live
        server_module.MODEL_KEY='test-key'
        def boom(*a,**k): raise server_module.validator.ConnectionFailure('模型接口未成功返回')
        server_module.decoder.run_live=boom
        try:
            status,raw,_=self.request('/api/decode',json.dumps({'transcript':'不要。'}))
        finally:
            server_module.MODEL_KEY=original_key;server_module.decoder.run_live=original_run
        self.assertEqual(status,502)
        self.assertIn('error',json.loads(raw))
        self.assertNotIn('units',json.loads(raw))

if __name__=='__main__':unittest.main(verbosity=2)
